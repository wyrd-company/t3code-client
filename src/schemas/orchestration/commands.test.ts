// ---
// relationships:
//   implements: design
// ---
import { describe, expect, it } from "vite-plus/test";
import { OrchestrationV2Command, MessageDispatchMode } from "./commands.ts";
import {
  OrchestrationGetTurnDiffInput,
  OrchestrationSearchThreadsInput,
  OrchestrationV2ThreadLaunchInput,
} from "./stream.ts";
import { OrchestrationV2ThreadLaunchWorkspaceStrategy } from "./runs.ts";
import { at, ids, modelSelection } from "../../../test/support/threadFixtures.ts";

const stamped = { commandId: "command-1", threadId: ids.threadId };
const creation = { createdBy: "user", creationSource: "web" };

const threadCreate = {
  type: "thread.create",
  ...creation,
  ...stamped,
  projectId: ids.projectId,
  title: "Sample thread",
  modelSelection,
  runtimeMode: "auto",
  interactionMode: "default",
  branch: null,
  worktreePath: null,
};

const messageDispatch = {
  type: "message.dispatch",
  ...creation,
  ...stamped,
  messageId: ids.messageId,
  text: "Say pong.",
  attachments: [],
  dispatchMode: { type: "queue_after_active" },
};

describe("OrchestrationV2Command", () => {
  it("accepts thread.create", () => {
    expect(OrchestrationV2Command.parse(threadCreate)).toEqual(threadCreate);
    expect(
      OrchestrationV2Command.parse({
        ...threadCreate,
        importedNativeThread: {
          ref: { driver: "sample-driver", nativeId: "native-1", strength: "strong" },
        },
      }),
    ).toMatchObject({ importedNativeThread: { ref: { nativeId: "native-1" } } });
  });
  it("accepts subagent.stop for one child of a run", () => {
    const stop = {
      type: "subagent.stop",
      commandId: "command-1",
      threadId: ids.threadId,
      runId: ids.runId,
      subagentId: "node-1",
    };
    expect(OrchestrationV2Command.parse(stop)).toEqual(stop);
    expect(OrchestrationV2Command.safeParse({ ...stop, subagentId: undefined }).success).toBe(
      false,
    );
  });
  it("accepts delegated_task.request with a worktree workspace strategy", () => {
    const request = {
      type: "delegated_task.request",
      ...creation,
      commandId: "command-1",
      parentThreadId: ids.threadId,
      parentRunId: ids.runId,
      parentNodeId: ids.nodeId,
      task: "Count the files.",
      modelSelection,
      runtimeMode: "auto",
      interactionMode: "default",
      workspaceStrategy: { type: "worktree", baseRef: "main" },
    };
    expect(OrchestrationV2Command.parse(request)).toMatchObject({
      workspaceStrategy: { type: "worktree", baseRef: "main" },
    });
    expect(
      OrchestrationV2Command.safeParse({ ...request, workspaceStrategy: { type: "future" } })
        .success,
    ).toBe(false);
  });
  it("accepts message.dispatch with each dispatch mode", () => {
    expect(OrchestrationV2Command.parse(messageDispatch)).toEqual(messageDispatch);
    for (const dispatchMode of [
      { type: "start_immediately" },
      { type: "steer_active", targetRunId: ids.runId },
      { type: "restart_active", targetRunId: ids.runId },
      { type: "defer_start", workspaceStrategy: { type: "root" } },
      { type: "defer_start" },
    ]) {
      expect(
        OrchestrationV2Command.safeParse({ ...messageDispatch, dispatchMode }).success,
        dispatchMode.type,
      ).toBe(true);
    }
    expect(
      OrchestrationV2Command.parse({
        ...messageDispatch,
        deliveryIntent: "steer",
        titleSeed: "Pong",
        modelSelection: { provider: "sample-provider", model: "sample-model" },
      }),
    ).toMatchObject({ deliveryIntent: "steer", modelSelection });
  });
  it("accepts run.interrupt and runtime-request.respond", () => {
    const interrupt = { type: "run.interrupt", ...stamped, runId: ids.runId, holdQueue: true };
    expect(OrchestrationV2Command.parse(interrupt)).toEqual(interrupt);
    const approve = {
      type: "runtime-request.respond",
      ...stamped,
      requestId: "request-1",
      decision: "accept",
    };
    expect(OrchestrationV2Command.parse(approve)).toEqual(approve);
    const answer = {
      type: "runtime-request.respond",
      ...stamped,
      requestId: "request-2",
      answers: { q1: "yes", q2: ["a", "b"] },
    };
    expect(OrchestrationV2Command.parse(answer)).toEqual(answer);
  });
  it("accepts the simple thread commands and a metadata update", () => {
    for (const type of [
      "thread.archive",
      "thread.unarchive",
      "thread.delete",
      "thread.unpin",
      "thread.mark-unread",
    ]) {
      expect(OrchestrationV2Command.safeParse({ type, ...stamped }).success, type).toBe(true);
    }
    expect(
      OrchestrationV2Command.parse({ type: "thread.visit", ...stamped, visitedAt: at }),
    ).toMatchObject({ visitedAt: at });
    expect(
      OrchestrationV2Command.parse({
        type: "thread.metadata.update",
        ...stamped,
        title: "Renamed",
        limitRecovery: { runId: ids.runId, resetAt: at, autoResume: true },
      }),
    ).toMatchObject({ title: "Renamed" });
  });
  it("rejects an unknown command type", () => {
    expect(OrchestrationV2Command.safeParse({ type: "thread.future", ...stamped }).success).toBe(
      false,
    );
  });
  it("rejects a known command missing its stamp or with malformed fields", () => {
    expect(
      OrchestrationV2Command.safeParse({ type: "thread.delete", threadId: ids.threadId }).success,
    ).toBe(false);
    expect(
      OrchestrationV2Command.safeParse({ ...messageDispatch, dispatchMode: { type: "future" } })
        .success,
    ).toBe(false);
    expect(
      OrchestrationV2Command.safeParse({ ...messageDispatch, dispatchMode: undefined }).success,
    ).toBe(false);
    expect(
      OrchestrationV2Command.safeParse({
        ...messageDispatch,
        dispatchMode: { type: "steer_active" },
      }).success,
    ).toBe(false);
    expect(OrchestrationV2Command.safeParse({ ...threadCreate, title: " " }).success).toBe(false);
    expect(
      OrchestrationV2Command.safeParse({
        type: "thread.auto-settle.set",
        ...stamped,
        enabled: "no",
      }).success,
    ).toBe(false);
    expect(
      OrchestrationV2Command.safeParse({
        type: "thread.metadata.update",
        ...stamped,
        limitRecovery: { runId: ids.runId, resetAt: at },
      }).success,
    ).toBe(false);
  });
  it("keeps MessageDispatchMode strict", () => {
    expect(MessageDispatchMode.safeParse({ type: "queue_after_active" }).success).toBe(true);
    expect(MessageDispatchMode.safeParse({ type: "later" }).success).toBe(false);
  });
});

describe("OrchestrationV2ThreadLaunchInput", () => {
  const launch = {
    commandId: "command-1",
    projectId: ids.projectId,
    title: "Sample thread",
    modelSelection,
    runtimeMode: "auto",
    interactionMode: "default",
    workspaceStrategy: { type: "root" },
  };
  it("accepts a launch with and without an initial message", () => {
    expect(OrchestrationV2ThreadLaunchInput.parse(launch)).toEqual(launch);
    expect(
      OrchestrationV2ThreadLaunchInput.parse({
        ...launch,
        threadId: ids.threadId,
        reuseExistingThread: true,
        generateTitle: true,
        workspaceStrategy: { type: "worktree", baseRef: "main", startFromOrigin: true },
        initialMessage: { text: "Say pong.", attachments: [] },
      }),
    ).toMatchObject({ workspaceStrategy: { type: "worktree", baseRef: "main" } });
  });
  it("rejects an unknown workspace strategy and a legacy-less model selection", () => {
    expect(
      OrchestrationV2ThreadLaunchInput.safeParse({
        ...launch,
        workspaceStrategy: { type: "future" },
      }).success,
    ).toBe(false);
    expect(
      OrchestrationV2ThreadLaunchWorkspaceStrategy.safeParse({ type: "worktree" }).success,
    ).toBe(false);
    expect(
      OrchestrationV2ThreadLaunchInput.safeParse({
        ...launch,
        modelSelection: { model: "sample-model" },
      }).success,
    ).toBe(false);
    expect(
      OrchestrationV2ThreadLaunchInput.safeParse({ ...launch, initialMessage: { text: "Hi" } })
        .success,
    ).toBe(false);
  });
});

describe("read inputs", () => {
  it("rejects reversed turn ranges and short searches", () => {
    expect(
      OrchestrationGetTurnDiffInput.safeParse({
        threadId: ids.threadId,
        fromTurnCount: 2,
        toTurnCount: 1,
      }).success,
    ).toBe(false);
    expect(
      OrchestrationGetTurnDiffInput.safeParse({
        threadId: ids.threadId,
        fromTurnCount: 1,
        toTurnCount: 1,
      }).success,
    ).toBe(true);
    expect(OrchestrationSearchThreadsInput.safeParse({ query: "a" }).success).toBe(false);
    expect(OrchestrationSearchThreadsInput.safeParse({ query: "pong", limit: 51 }).success).toBe(
      false,
    );
    expect(OrchestrationSearchThreadsInput.parse({ query: " pong " })).toEqual({ query: "pong" });
  });
});
