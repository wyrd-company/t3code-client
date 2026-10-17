// ---
// relationships:
//   implements: library
// ---
import { describe, expect, it } from "vite-plus/test";
import {
  OrchestrationV2ArchivedShellStreamItem,
  OrchestrationV2ShellSnapshot,
  OrchestrationV2ShellStreamItem,
  OrchestrationV2ThreadShell,
} from "./shell.ts";
import {
  ids,
  makeAppThread,
  makeShellProject,
  makeShellSnapshot,
  makeShellThread,
} from "../../../test/support/threadFixtures.ts";

describe("OrchestrationV2ThreadShell", () => {
  it("decodes the fixture shell thread and defaults its rosters", () => {
    const thread = makeShellThread();
    expect(thread).toMatchObject({
      id: ids.threadId,
      status: "idle",
      pendingBackgroundTasks: [],
      providerInstanceHistory: [],
    });
  });
  it("keeps an unknown status and passes unknown keys through", () => {
    const thread = makeShellThread({
      status: "future-status",
      pendingBackgroundTasks: [{ taskId: "task-1", kind: "future" }],
      futureField: 1,
    });
    expect(thread.status).toBe("future-status");
    expect(thread.pendingBackgroundTasks).toEqual([{ taskId: "task-1", kind: "background_task" }]);
    expect(thread).toMatchObject({ futureField: 1 });
  });
  it("fails a shell thread missing its counters", () => {
    const raw = { ...makeAppThread(), latestRunId: null, activeRunId: null, status: "idle" };
    expect(OrchestrationV2ThreadShell.safeParse(raw).success).toBe(false);
  });
});

describe("OrchestrationV2ShellSnapshot", () => {
  it("decodes projects, threads, and archived threads", () => {
    const snapshot = makeShellSnapshot({
      projects: [makeShellProject()],
      threads: [makeShellThread()],
      archivedThreads: [
        makeShellThread({ id: "thread-2", archivedAt: "2020-01-02T00:00:00.000Z" }),
      ],
      snapshotSequence: 7,
    });
    expect(snapshot.snapshotSequence).toBe(7);
    expect(snapshot.projects[0]?.id).toBe(ids.projectId);
    expect(snapshot.archivedThreads[0]?.id).toBe("thread-2");
  });
  it("decodes a project icon and favicon on the project shell", () => {
    const project = makeShellProject({
      projectIcon: { kind: "lucide", name: "folder", color: "blue", monogramText: "AB" },
      faviconPath: "/srv/sample/favicon.png",
    });
    expect(project.projectIcon).toEqual({ kind: "monogram", text: "AB", color: "blue" });
    expect(project.faviconPath).toBe("/srv/sample/favicon.png");
  });
  it("fails without a schema version", () => {
    expect(
      OrchestrationV2ShellSnapshot.safeParse({
        snapshotSequence: 1,
        projects: [],
        threads: [],
        archivedThreads: [],
      }).success,
    ).toBe(false);
  });
});

describe("OrchestrationV2ShellStreamItem", () => {
  const snapshot = makeShellSnapshot({ threads: [makeShellThread()] });
  it("decodes every known kind", () => {
    expect(OrchestrationV2ShellStreamItem.parse({ kind: "synchronized" })).toEqual({
      kind: "synchronized",
    });
    expect(
      OrchestrationV2ShellStreamItem.parse({
        kind: "snapshot",
        snapshot,
        resolvedRepositoryIdentityRoots: ["/srv"],
      }),
    ).toMatchObject({ kind: "snapshot", snapshot: { snapshotSequence: 1 } });
    expect(
      OrchestrationV2ShellStreamItem.parse({
        kind: "project.updated",
        sequence: 2,
        project: makeShellProject(),
      }),
    ).toMatchObject({ kind: "project.updated", project: { id: ids.projectId } });
    expect(
      OrchestrationV2ShellStreamItem.parse({
        kind: "project.removed",
        sequence: 3,
        projectId: ids.projectId,
      }),
    ).toEqual({ kind: "project.removed", sequence: 3, projectId: ids.projectId });
    expect(
      OrchestrationV2ShellStreamItem.parse({
        kind: "thread.updated",
        sequence: 4,
        location: "archive",
        thread: makeShellThread(),
      }),
    ).toMatchObject({ kind: "thread.updated", location: "archive", thread: { id: ids.threadId } });
    expect(
      OrchestrationV2ShellStreamItem.parse({
        kind: "thread.removed",
        sequence: 5,
        location: "future-location",
        threadId: ids.threadId,
      }),
    ).toMatchObject({ kind: "thread.removed", location: "future-location" });
  });
  it("decodes an unknown kind as the unknown variant", () => {
    const raw = { kind: "future.kind", sequence: 6 };
    expect(OrchestrationV2ShellStreamItem.parse(raw)).toEqual({ unknown: true, raw });
  });
  it("fails a known kind that is malformed", () => {
    expect(OrchestrationV2ShellStreamItem.safeParse({ kind: "snapshot" }).success).toBe(false);
    expect(
      OrchestrationV2ShellStreamItem.safeParse({ kind: "thread.removed", sequence: 1 }).success,
    ).toBe(false);
    expect(
      OrchestrationV2ShellStreamItem.safeParse({
        kind: "thread.updated",
        sequence: 1,
        location: "active",
        thread: {},
      }).success,
    ).toBe(false);
  });
});

describe("OrchestrationV2ArchivedShellStreamItem", () => {
  it("decodes its snapshot and thread items, and unknown kinds", () => {
    const archived = {
      schemaVersion: 1,
      snapshotSequence: 1,
      projects: [],
      threads: [makeShellThread()],
    };
    expect(
      OrchestrationV2ArchivedShellStreamItem.parse({ kind: "snapshot", snapshot: archived }),
    ).toMatchObject({
      kind: "snapshot",
      snapshot: { threads: [{ id: ids.threadId }] },
    });
    expect(
      OrchestrationV2ArchivedShellStreamItem.parse({
        kind: "thread.updated",
        sequence: 2,
        thread: makeShellThread(),
      }),
    ).toMatchObject({ kind: "thread.updated" });
    expect(
      OrchestrationV2ArchivedShellStreamItem.parse({
        kind: "thread.removed",
        sequence: 3,
        threadId: ids.threadId,
      }),
    ).toMatchObject({ kind: "thread.removed" });
    expect(OrchestrationV2ArchivedShellStreamItem.parse({ kind: "future" })).toEqual({
      unknown: true,
      raw: { kind: "future" },
    });
  });
});
