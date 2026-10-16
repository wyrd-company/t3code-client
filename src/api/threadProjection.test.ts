import { describe, expect, it } from "vite-plus/test";
import {
  at,
  events,
  ids,
  items,
  makeAppThread,
  makeMessage,
  makeProjection,
  makePullRequestLink,
  makeRun,
  makeRuntimeRequest,
  parseEvent,
  rawEvent,
} from "../../test/support/threadFixtures.ts";
import { applyThreadEvent, isKnownVariant, upsertById } from "./threadProjection.ts";

const later = "2020-01-01T00:00:05.000Z";
/** The domain event inside a wire-shaped stream item, stamped at `later`. */
const ev = (item: Record<string, unknown>) =>
  parseEvent({ ...(item["event"] as Record<string, unknown>), occurredAt: later });

describe("upsertById", () => {
  it("appends a new entry and replaces an existing one in place", () => {
    const entries = [
      { id: "a", n: 1 },
      { id: "b", n: 1 },
    ];
    expect(upsertById(entries, { id: "c", n: 1 })).toEqual([...entries, { id: "c", n: 1 }]);
    expect(upsertById(entries, { id: "a", n: 2 })).toEqual([
      { id: "a", n: 2 },
      { id: "b", n: 1 },
    ]);
  });
});

describe("applyThreadEvent", () => {
  it("replaces the thread record on thread.* events and stamps updatedAt", () => {
    let projection = makeProjection();
    projection = applyThreadEvent(
      projection,
      ev(events.threadState(1, "thread.metadata-updated", { title: "Renamed" })),
    );
    expect(projection.thread.title).toBe("Renamed");
    expect(projection.updatedAt).toBe(later);
    projection = applyThreadEvent(
      projection,
      ev(events.threadState(2, "thread.archived", { title: "Renamed", archivedAt: later })),
    );
    expect(projection.thread.archivedAt).toBe(later);
    projection = applyThreadEvent(
      projection,
      ev(events.threadState(3, "thread.created", { title: "Fresh" })),
    );
    expect(projection.thread.title).toBe("Fresh");
  });

  it("replaces the matching pull request link and keeps the others", () => {
    const thread = makeAppThread({
      pullRequests: [makePullRequestLink(1), makePullRequestLink(2)],
    });
    let projection = applyThreadEvent(
      makeProjection(),
      ev(events.threadState(1, "thread.pull-request-synced", thread)),
    );
    projection = applyThreadEvent(
      projection,
      ev(
        events.pullRequestLinkUpdated(
          2,
          makePullRequestLink(2, { host: "Git.Example.Test", source: "agent" }),
        ),
      ),
    );
    expect(projection.thread.pullRequests?.map((link) => [link.number, link.source])).toEqual([
      [1, "manual"],
      [2, "agent"],
    ]);
    expect(projection.updatedAt).toBe(later);
  });

  it("upserts runs by id and keeps their order", () => {
    let projection = makeProjection();
    projection = applyThreadEvent(projection, ev(events.runCreated(1)));
    projection = applyThreadEvent(
      projection,
      ev(events.runCreated(2, { id: "run-2", ordinal: 2 })),
    );
    projection = applyThreadEvent(
      projection,
      ev(events.runUpdated(3, { status: "completed", completedAt: at })),
    );
    expect(projection.runs.map((run) => [run.id, run.status])).toEqual([
      ["run-1", "completed"],
      ["run-2", "running"],
    ]);
  });

  it("patches cancelled background work onto a known run only", () => {
    const projection = makeProjection({ runs: [makeRun()] });
    const payload = {
      runId: ids.runId,
      restartCancelledBackgroundWork: [{ kind: "shell", label: "sample job" }],
    };
    const patched = applyThreadEvent(
      projection,
      parseEvent(rawEvent(1, "run.background-work-cancelled", payload)),
    );
    expect(patched.runs[0]?.restartCancelledBackgroundWork).toEqual([
      { kind: "shell", label: "sample job" },
    ]);
    const unknownRun = parseEvent(
      rawEvent(2, "run.background-work-cancelled", { ...payload, runId: "run-9" }),
    );
    expect(applyThreadEvent(projection, unknownRun)).toBe(projection);
  });

  it("upserts attempts and nodes", () => {
    const attempt = {
      id: "attempt-1",
      runId: ids.runId,
      attemptOrdinal: 1,
      rootNodeId: ids.nodeId,
      providerInstanceId: "sample-provider",
      providerThreadId: "provider-thread-1",
      providerTurnId: null,
      reason: "initial",
      status: "running",
      startedAt: at,
      completedAt: null,
    };
    const node = {
      id: ids.nodeId,
      threadId: ids.threadId,
      runId: ids.runId,
      parentNodeId: null,
      rootNodeId: ids.nodeId,
      kind: "root_turn",
      status: "running",
      countsForRun: true,
      providerThreadId: null,
      providerTurnId: null,
      nativeItemRef: null,
      runtimeRequestId: null,
      checkpointScopeId: null,
      startedAt: at,
      completedAt: null,
    };
    let projection = makeProjection();
    projection = applyThreadEvent(
      projection,
      parseEvent(rawEvent(1, "run-attempt.created", attempt)),
    );
    projection = applyThreadEvent(
      projection,
      parseEvent(rawEvent(2, "run-attempt.updated", { ...attempt, status: "completed" })),
    );
    projection = applyThreadEvent(projection, parseEvent(rawEvent(3, "node.updated", node)));
    expect(projection.attempts).toMatchObject([{ id: "attempt-1", status: "completed" }]);
    expect(projection.nodes).toMatchObject([{ id: ids.nodeId, kind: "root_turn" }]);
  });

  it("upserts messages, turn items, runtime requests, and plans", () => {
    let projection = makeProjection();
    projection = applyThreadEvent(projection, ev(events.messageUpdated(1, { text: "hi" })));
    projection = applyThreadEvent(projection, ev(events.messageUpdated(2, { text: "hi there" })));
    projection = applyThreadEvent(
      projection,
      ev(events.turnItemUpdated(3, items.assistantMessage("po"))),
    );
    projection = applyThreadEvent(
      projection,
      ev(events.turnItemUpdated(4, items.assistantMessage("pong", false))),
    );
    projection = applyThreadEvent(projection, ev(events.runtimeRequestUpdated(5, "r1")));
    projection = applyThreadEvent(
      projection,
      ev(events.runtimeRequestUpdated(6, "r1", { status: "resolved", resolvedAt: later })),
    );
    const plan = {
      id: "plan-1",
      threadId: ids.threadId,
      runId: ids.runId,
      nodeId: ids.nodeId,
      status: "active",
      kind: "todo_list",
      steps: [{ id: "s1", text: "Do it", status: "pending" }],
    };
    projection = applyThreadEvent(projection, parseEvent(rawEvent(7, "plan.updated", plan)));
    expect(projection.messages).toMatchObject([{ id: ids.messageId, text: "hi there" }]);
    expect(projection.turnItems).toMatchObject([
      { id: ids.itemId, text: "pong", streaming: false },
    ]);
    expect(projection.runtimeRequests).toMatchObject([{ id: "r1", status: "resolved" }]);
    expect(projection.plans).toMatchObject([{ id: "plan-1", kind: "todo_list" }]);
    expect(projection.visibleTurnItems).toEqual([]);
  });

  it("leaves the projection alone for unknown item types, plans, and rollback requests", () => {
    const projection = makeProjection();
    const unknownItem = ev(
      events.turnItemUpdated(1, { ...items.assistantMessage("x"), type: "something_new" }),
    );
    expect(applyThreadEvent(projection, unknownItem)).toBe(projection);
    const unknownPlan = parseEvent(
      rawEvent(2, "plan.updated", {
        id: "plan-1",
        threadId: ids.threadId,
        runId: null,
        nodeId: ids.nodeId,
        status: "draft",
        kind: "something_new",
      }),
    );
    expect(applyThreadEvent(projection, unknownPlan)).toBe(projection);
    const rollback = parseEvent(
      rawEvent(3, "checkpoint.rollback-requested", {
        scopeId: "scope-1",
        checkpointId: "checkpoint-1",
        requestedAt: at,
      }),
    );
    expect(applyThreadEvent(projection, rollback)).toBe(projection);
  });

  it("ignores events for other threads and events of unknown types", () => {
    const projection = makeProjection();
    const other = parseEvent({ ...rawEvent(1, "run.created", makeRun()), threadId: "thread-2" });
    expect(applyThreadEvent(projection, other)).toBe(projection);
    const unknown = parseEvent(rawEvent(2, "thread.something-new", makeAppThread()));
    expect(isKnownVariant(unknown)).toBe(false);
    expect(applyThreadEvent(projection, unknown)).toBe(projection);
    expect(projection.updatedAt).toBe(at);
  });

  it("a message that reuses an id replaces the record", () => {
    const projection = makeProjection({ messages: [makeMessage({ text: "first" })] });
    const next = applyThreadEvent(projection, ev(events.messageUpdated(1, { text: "second" })));
    expect(next.messages).toHaveLength(1);
    expect(next.messages[0]?.text).toBe("second");
    expect(next.runtimeRequests).toBe(projection.runtimeRequests);
    expect(makeRuntimeRequest("r1")["status"]).toBe("pending");
  });
});
