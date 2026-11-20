// ---
// relationships:
//   verifies: request-watch
// ---
import { describe, expect, it } from "vite-plus/test";
import {
  items,
  makeProjection,
  makeRun,
  makeRuntimeRequest,
  makeShellProject,
  makeShellSnapshot,
  makeShellThread,
  makeAppThread,
} from "../../test/support/threadFixtures.ts";
import { T3PreconditionError } from "../errors.ts";
import { projectId, threadId } from "../schemas/common.ts";
import {
  checkFilters,
  isIncluded,
  isSelected,
  needsThreadWatch,
  RequestIndex,
  type RequestWatchFilters,
} from "./requestIndex.ts";
import { pendingRequests } from "./threadDerived.ts";

const summary = { id: "request-1", kind: "command", createdAt: "2020-01-01T00:00:00.000Z" };
const waiting = (overrides: Record<string, unknown> = {}) =>
  makeShellThread({ pendingRuntimeRequest: summary, ...overrides });
const filters = (options: RequestWatchFilters = {}) => checkFilters(options);

describe("checkFilters", () => {
  it("trims ids and tags and rejects malformed values", () => {
    const checked = checkFilters({
      projectIds: [projectId(" project-1 ")],
      excludeThreadIds: [threadId("thread-2")],
      excludeTags: [" reviewer "],
      kind: "approval",
    });
    expect([...checked.projectIds]).toEqual(["project-1"]);
    expect([...checked.excludeTags]).toEqual(["reviewer"]);
    expect(checked.kind).toBe("approval");
    const bad: unknown[] = [
      { kind: "question" },
      { projectIds: [""] },
      { excludeThreadIds: "thread-1" },
      { excludeTags: ["a\nb"] },
      { excludeTags: ["x".repeat(65)] },
    ];
    for (const options of bad) {
      expect(() => checkFilters(options as RequestWatchFilters)).toThrow(T3PreconditionError);
    }
  });
});

describe("inclusion", () => {
  it("excludes by exact id and by the thread's own trimmed tags, and selects projects", () => {
    const checked = filters({
      projectIds: [projectId("project-1")],
      excludeThreadIds: [threadId("thread-manager")],
      excludeTags: ["reviewer"],
    });
    const thread = { id: "thread-1", projectId: "project-1", tags: [] };
    expect(isIncluded(checked, thread)).toBe(true);
    expect(isIncluded(checked, { ...thread, id: "thread-manager" })).toBe(false);
    expect(isIncluded(checked, { ...thread, id: "thread-manager-child" })).toBe(true);
    expect(isIncluded(checked, { ...thread, tags: [" reviewer "] })).toBe(false);
    expect(isIncluded(checked, { ...thread, tags: ["Reviewer"] })).toBe(true);
    expect(isIncluded(checked, { ...thread, projectId: "project-2" })).toBe(false);
    expect(isIncluded(checked, { ...thread, projectId: undefined })).toBe(false);
    expect(isIncluded(filters(), { ...thread, projectId: undefined })).toBe(true);
  });

  it("selects a request by kind and by its thread record", () => {
    const projection = makeProjection({
      runtimeRequests: [
        makeRuntimeRequest("request-1"),
        makeRuntimeRequest("request-2", { kind: "user_input" }),
      ],
      turnItems: [items.approvalRequest("request-1"), items.userInputRequest("request-2")],
    });
    const [approval, question] = pendingRequests(projection);
    const record = projection.thread;
    expect(isSelected(filters({ kind: "approval" }), approval!, record)).toBe(true);
    expect(isSelected(filters({ kind: "approval" }), question!, record)).toBe(false);
    expect(isSelected(filters({ excludeTags: ["x"] }), question!, { ...record, tags: ["x"] })).toBe(
      false,
    );
  });
});

describe("RequestIndex", () => {
  it("takes rows, removals and listings, and keeps project titles", () => {
    const index = new RequestIndex();
    index.row(waiting({ id: "thread-1", tags: ["a"] }));
    index.row(makeShellThread({ id: "thread-2" }));
    expect(index.get(threadId("thread-1"))).toMatchObject({
      location: "active",
      projectId: "project-1",
      tags: ["a"],
      hasSummary: true,
    });
    expect(index.removed(threadId("thread-1"))).toMatchObject({
      location: "removed",
      tags: ["a"],
      hasSummary: false,
    });
    expect(index.removed(threadId("thread-9"))).toMatchObject({ projectId: undefined, tags: [] });
    const changed = index.listing(
      makeShellSnapshot({
        threads: [makeShellThread({ id: "thread-3" })],
        projects: [makeShellProject({ title: "Sample" })],
      }),
    );
    expect(changed).toEqual(["thread-3", "thread-2"]);
    expect(index.removedIds().sort()).toEqual(["thread-1", "thread-2", "thread-9"]);
    expect(index.projectTitle("project-1")).toBe("Sample");
    index.projectRemoved("project-1");
    expect(index.projectTitle("project-1")).toBeNull();
  });
});

describe("needsThreadWatch", () => {
  const index = new RequestIndex();
  const facts = { view: undefined, outstanding: false, cardWait: false };
  const running = makeProjection({ runs: [makeRun()] });
  const pending = makeProjection({ runtimeRequests: [makeRuntimeRequest("request-1")] });

  it("watches an included active thread whose row shows a summary", () => {
    const thread = index.row(waiting());
    expect(needsThreadWatch(filters(), { ...facts, thread })).toBe(true);
    expect(needsThreadWatch(filters({ excludeTags: ["x"] }), { ...facts, thread })).toBe(true);
    const tagged = index.row(waiting({ tags: ["x"] }));
    expect(needsThreadWatch(filters({ excludeTags: ["x"] }), { ...facts, thread: tagged })).toBe(
      false,
    );
    const idle = index.row(makeShellThread());
    expect(needsThreadWatch(filters(), { ...facts, thread: idle })).toBe(false);
    expect(needsThreadWatch(filters(), { ...facts, thread: idle, view: running })).toBe(false);
  });

  it("keeps a thread watched while it holds a selected pending request", () => {
    const idle = index.row(makeShellThread());
    expect(needsThreadWatch(filters(), { ...facts, thread: idle, view: pending })).toBe(true);
    expect(
      needsThreadWatch(filters({ kind: "user-input" }), { ...facts, thread: idle, view: pending }),
    ).toBe(false);
  });

  it("watches a removed thread while its included view holds a run that has not ended", () => {
    const removed = index.removed(threadId("thread-1"));
    expect(needsThreadWatch(filters(), { ...facts, thread: removed, view: running })).toBe(true);
    const ended = makeProjection({ runs: [makeRun({ status: "completed" })] });
    expect(needsThreadWatch(filters(), { ...facts, thread: removed, view: ended })).toBe(false);
    const tagged = makeProjection({ thread: makeAppThread({ tags: ["x"] }), runs: [makeRun()] });
    expect(
      needsThreadWatch(filters({ excludeTags: ["x"] }), {
        ...facts,
        thread: removed,
        view: tagged,
      }),
    ).toBe(false);
  });

  it("watches while a removal or recheck is outstanding or a card is awaited", () => {
    expect(needsThreadWatch(filters(), { ...facts, thread: undefined, outstanding: true })).toBe(
      true,
    );
    expect(needsThreadWatch(filters(), { ...facts, thread: undefined, cardWait: true })).toBe(true);
    expect(needsThreadWatch(filters(), { ...facts, thread: undefined })).toBe(false);
  });
});
