// ---
// relationships:
//   verifies: library
// ---
import { describe, expect, it } from "vite-plus/test";
import { OrchestrationV2Command } from "./commands.ts";
import {
  OrchestrationV2PendingBackgroundTask,
  OrchestrationV2RuntimeRequestResponseCapability,
} from "./providerState.ts";
import { OrchestrationV2Checkpoint, OrchestrationV2Subagent } from "./runs.ts";
import { OrchestrationV2AppThreadLineage, OrchestrationV2LenientThreadOpens } from "./thread.ts";
import { OrchestrationV2TurnItem } from "./turnItems.ts";
import { OrchestrationV2WorkflowAgent } from "./workflow.ts";

const baseItem = {
  id: "item-1",
  threadId: "thread-1",
  runId: "run-1",
  nodeId: "node-1",
  providerThreadId: null,
  providerTurnId: null,
  nativeItemRef: null,
  parentItemId: null,
  ordinal: 1,
  status: "completed",
  title: null,
  startedAt: "2026-01-01T00:00:00.000Z",
  completedAt: "2026-01-01T00:00:01.000Z",
  updatedAt: "2026-01-01T00:00:01.000Z",
};
const remoteChild = {
  environmentId: "environment-1",
  threadId: "thread-2",
  label: "Sample environment",
  stoppedThere: true,
  stopCount: 1,
};
const filesTotal = { count: 500, additions: 10, deletions: 2 };

describe("thread opens", () => {
  it("keeps valid opens and loads opens that do not decode as null", () => {
    const opens = { openedAt: 1, score: 1, picks: [{ query: "sample", at: 1 }] };
    expect(OrchestrationV2LenientThreadOpens.parse(opens)).toEqual(opens);
    expect(OrchestrationV2LenientThreadOpens.parse({ openedAt: "bad" })).toBeNull();
  });

  it("reads a side chat from the lineage", () => {
    const lineage = OrchestrationV2AppThreadLineage.parse({
      parentThreadId: "thread-1",
      relationshipToParent: "fork",
      rootThreadId: "thread-1",
      sideChat: true,
    });
    expect(lineage.sideChat).toBe(true);
  });
});

describe("turn items", () => {
  it.each([
    ["command_execution", { input: "sample", monitor: true }, "monitor", true],
    [
      "run_interrupt_request",
      { message: "Stop", unresponsiveAt: "2026-01-01T00:00:02.000Z" },
      "unresponsiveAt",
      "2026-01-01T00:00:02.000Z",
    ],
    [
      "checkpoint",
      { checkpointId: "checkpoint-1", scopeId: "scope-1", files: [], filesTotal },
      "filesTotal",
      filesTotal,
    ],
    [
      "secret_request",
      { label: "Sample", reason: "Sample", secretStatus: "pending", delivery: "file" },
      "delivery",
      "file",
    ],
    [
      "subagent",
      {
        subagentId: "node-2",
        origin: "app_owned",
        driver: "codex",
        providerInstanceId: "codex",
        childThreadId: null,
        remoteChild,
        prompt: "Sample",
        result: null,
      },
      "remoteChild",
      remoteChild,
    ],
    [
      "user_message",
      {
        messageId: "message-1",
        createdBy: "agent",
        creationSource: "server",
        idleCompaction: "onReturn",
        inputIntent: "turn_start",
        text: "/compact",
        attachments: [],
      },
      "idleCompaction",
      "onReturn",
    ],
  ])("types %s", (type, fields, key, value) => {
    const item = OrchestrationV2TurnItem.parse({ ...baseItem, type, ...fields });
    expect(item).toMatchObject({ type, [key]: value });
  });
});

describe("run records", () => {
  it("reads the feedback capability and the awaited marker", () => {
    expect(
      OrchestrationV2RuntimeRequestResponseCapability.parse({
        type: "live",
        providerSessionId: "session-1",
        supportsFeedback: true,
      }),
    ).toMatchObject({ supportsFeedback: true });
    expect(
      OrchestrationV2PendingBackgroundTask.parse({
        taskId: "task-1",
        kind: "command",
        awaited: true,
      }),
    ).toMatchObject({ kind: "command", awaited: true });
  });

  it("reads workflow agent effort and speed", () => {
    expect(
      OrchestrationV2WorkflowAgent.parse({
        index: 0,
        label: "Sample",
        state: "running",
        effort: "high",
        speed: "fast",
      }),
    ).toMatchObject({ effort: "high", speed: "fast" });
  });

  it("reads checkpoint totals and a remote child", () => {
    expect(
      OrchestrationV2Checkpoint.parse({
        id: "checkpoint-1",
        threadId: "thread-1",
        scopeId: "scope-1",
        runId: null,
        nodeId: "node-1",
        parentCheckpointId: null,
        ordinalWithinScope: 0,
        appRunOrdinal: null,
        ref: "refs/sample",
        status: "ready",
        files: [],
        filesTotal,
        capturedAt: "2026-01-01T00:00:00.000Z",
      }).filesTotal,
    ).toEqual(filesTotal);
    expect(
      OrchestrationV2Subagent.parse({
        id: "node-2",
        threadId: "thread-1",
        runId: null,
        parentNodeId: "node-1",
        origin: "app_owned",
        createdBy: "agent",
        driver: "codex",
        providerInstanceId: "codex",
        providerThreadId: null,
        childThreadId: null,
        remoteChild,
        nativeTaskRef: null,
        prompt: "Sample",
        title: null,
        model: null,
        status: "running",
        result: null,
        startedAt: null,
        completedAt: null,
        updatedAt: "2026-01-01T00:00:00.000Z",
      }).remoteChild,
    ).toEqual(remoteChild);
  });
});

describe("commands", () => {
  it.each([
    [{ type: "thread.stop", stopDelegatedTasks: false }],
    [{ type: "thread.delete", onlyIfUnused: true }],
    [
      {
        type: "thread.visit",
        visitedAt: "2026-01-01T00:00:00.000Z",
        opened: true,
        searchQuery: "sample",
      },
    ],
    [{ type: "runtime-request.respond", requestId: "r", decision: "decline", feedback: "No" }],
    [
      {
        type: "message.dispatch",
        createdBy: "agent",
        creationSource: "server",
        idleCompaction: "beforeCacheExpires",
        messageId: "message-1",
        text: "/compact",
        attachments: [],
        dispatchMode: { type: "start_immediately" },
      },
    ],
  ])("keeps the fields of %o", (fields) => {
    const command = { commandId: "command-1", threadId: "thread-1", ...fields };
    expect(OrchestrationV2Command.parse(command)).toMatchObject(fields);
  });

  it("refuses a search query above the server limit", () => {
    expect(
      OrchestrationV2Command.safeParse({
        type: "thread.visit",
        commandId: "command-1",
        threadId: "thread-1",
        visitedAt: "2026-01-01T00:00:00.000Z",
        searchQuery: "x".repeat(201),
      }).success,
    ).toBe(false);
  });
});
