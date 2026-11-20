// ---
// relationships:
//   verifies: library
// ---
import * as NodeFS from "node:fs";
import { describe, expect, it } from "vite-plus/test";
import {
  at,
  ids,
  makeMessage,
  makeProjection,
  makeRun,
  makeShellProject,
  makeShellThread,
  makeTurnItem,
  parseEvent,
  rawEvent,
} from "../../../test/support/threadFixtures.ts";
import { applyThreadEvent } from "../../api/threadProjection.ts";
import { OrchestrationV2CheckpointFileSummary } from "./checkpoints.ts";
import { OrchestrationV2Command } from "./commands.ts";
import { OrchestrationV2ConversationMessage, OrchestrationV2Notification } from "./messages.ts";
import { OrchestrationV2TurnCapabilities } from "./providerCapabilities.ts";
import {
  OrchestrationV2PendingBackgroundTask,
  OrchestrationV2ProviderThreadNativeMetadata,
} from "./providerState.ts";
import { OrchestrationV2Run, OrchestrationV2Subagent } from "./runs.ts";
import {
  OrchestrationProjectShell,
  OrchestrationV2PendingRuntimeRequestSummary,
  OrchestrationV2ShellSnapshot,
  OrchestrationV2SubscribeShellInput,
} from "./shell.ts";
import { OrchestrationV2TurnItem } from "./turnItems.ts";

const shellFixture: unknown = JSON.parse(
  NodeFS.readFileSync(
    new URL("../../../test/fixtures/orchestration-shell.json", import.meta.url),
    "utf8",
  ),
);
const linkedSender = { environmentId: "environment-2", threadId: "thread-9", title: "Sample" };
const stamp = { commandId: "command-1", threadId: ids.threadId, createdAt: at };

/** A loose object passes unknown keys through, so a typed field shows by refusing a bad value. */
function rejects(schema: { safeParse(value: unknown): { success: boolean } }, value: unknown) {
  expect(schema.safeParse(value).success).toBe(false);
}

describe("orchestration field changes of 0.1.10", () => {
  it("reads whether a pending request is only the user's to answer", () => {
    const summary = { id: ids.requestId, kind: "approval", createdAt: at };
    expect(OrchestrationV2PendingRuntimeRequestSummary.parse(summary)).not.toHaveProperty(
      "userOnly",
    );
    expect(
      OrchestrationV2PendingRuntimeRequestSummary.parse({ ...summary, userOnly: true }).userOnly,
    ).toBe(true);
    const thread = makeShellThread({ pendingRuntimeRequest: { ...summary, userOnly: true } });
    expect(thread.pendingRuntimeRequest?.userOnly).toBe(true);
    rejects(OrchestrationV2PendingRuntimeRequestSummary, { ...summary, userOnly: "yes" });
  });

  it("reads the outcome of the last title regeneration on the thread and its shell", () => {
    const last = {
      status: "failed",
      message: "No model.",
      requestId: "command-1",
      completedAt: at,
    };
    expect(makeShellThread({ lastTitleRegeneration: last }).lastTitleRegeneration).toEqual(last);
    expect(makeShellThread({ lastTitleRegeneration: null }).lastTitleRegeneration).toBeNull();
    const { requestId: _, ...withoutRequest } = last;
    expect(() => makeShellThread({ lastTitleRegeneration: withoutRequest })).toThrow();
  });

  it("applies a visit to the thread without replacing the rest of it", () => {
    const opens = { openedAt: 1, score: 1, picks: [] };
    const projection = makeProjection();
    const event = parseEvent(
      rawEvent(1, "thread.visit-recorded", { lastVisitedAt: "2020-01-02T00:00:00.000Z", opens }),
    );
    const next = applyThreadEvent(projection, event);
    expect(next.thread).toEqual({
      ...projection.thread,
      lastVisitedAt: "2020-01-02T00:00:00.000Z",
      opens,
    });
    const withoutOpens = parseEvent(
      rawEvent(2, "thread.visit-recorded", { lastVisitedAt: "2020-01-03T00:00:00.000Z" }),
    );
    expect(applyThreadEvent(next, withoutOpens).thread.opens).toEqual(opens);
  });

  it("reads the linked sender of a message and of a user message turn item", () => {
    const message = OrchestrationV2ConversationMessage.parse(
      makeMessage({ linkedSender, followsThreadSelection: true }),
    );
    expect(message).toMatchObject({ linkedSender, followsThreadSelection: true });
    rejects(OrchestrationV2ConversationMessage, makeMessage({ followsThreadSelection: false }));
    rejects(
      OrchestrationV2ConversationMessage,
      makeMessage({ linkedSender: { ...linkedSender, title: undefined } }),
    );
    const item = OrchestrationV2TurnItem.parse(
      makeTurnItem("user_message", {
        messageId: ids.messageId,
        inputIntent: "message",
        text: "Sample",
        attachments: [],
        createdBy: "agent",
        creationSource: "mcp",
        linkedSender,
      }),
    );
    expect(item).toMatchObject({ type: "user_message", linkedSender });
  });

  it("reads the phase of an assistant message, the wake of a command and a notice level", () => {
    const assistant = OrchestrationV2TurnItem.parse(
      makeTurnItem("assistant_message", {
        messageId: "message-2",
        text: "Sample",
        streaming: false,
        phase: "final_answer",
      }),
    );
    expect(assistant).toMatchObject({ phase: "final_answer" });
    const command = OrchestrationV2TurnItem.parse(
      makeTurnItem("command_execution", { input: "sample", completionWake: "always" }),
    );
    expect(command).toMatchObject({ completionWake: "always" });
    const notice = OrchestrationV2TurnItem.parse(
      makeTurnItem("system_notice", { message: "Sample", level: "info" }),
    );
    expect(notice).toMatchObject({ level: "info" });
    expect(
      OrchestrationV2TurnItem.parse(makeTurnItem("system_notice", { message: "Sample" })),
    ).not.toHaveProperty("level");
    rejects(OrchestrationV2TurnItem, makeTurnItem("system_notice", { message: "A", level: 1 }));
    rejects(
      OrchestrationV2TurnItem,
      makeTurnItem("command_execution", { input: "sample", completionWake: "settled_only" }),
    );
    rejects(
      OrchestrationV2TurnItem,
      makeTurnItem("assistant_message", { messageId: "m", text: "", streaming: false, phase: 1 }),
    );
  });

  it("reads the pull requests a monitor wake reports on", () => {
    const pullRequest = {
      host: "forge.invalid",
      repository: "sample/repo",
      number: 1,
      watchStartedAt: at,
      headSha: null,
      section: { text: "Checks passed.", outcome: "completed", summary: "Checks passed" },
    };
    const notification = OrchestrationV2Notification.parse({
      source: { kind: "monitor", pullRequest, otherPullRequests: [{ ...pullRequest, number: 2 }] },
      outcome: "updated",
      summary: "Checks changed",
    });
    expect(notification.source).toEqual({
      kind: "monitor",
      pullRequest,
      otherPullRequests: [{ ...pullRequest, number: 2 }],
    });
    expect(
      OrchestrationV2Notification.parse({
        source: { kind: "monitor" },
        outcome: "updated",
        summary: "Checks changed",
      }).source,
    ).toEqual({ kind: "monitor" });
  });

  it("reads run, subagent, background task and provider thread fields", () => {
    const run = OrchestrationV2Run.parse(
      makeRun({ steerWhenReadyRunId: "run-0", manualContinuationOfRunId: "run-0" }),
    );
    expect(run).toMatchObject({ steerWhenReadyRunId: "run-0", manualContinuationOfRunId: "run-0" });
    rejects(OrchestrationV2Run, makeRun({ steerWhenReadyRunId: 1 }));
    rejects(OrchestrationV2Run, makeRun({ manualContinuationOfRunId: 1 }));
    const subagent = OrchestrationV2Subagent.parse({
      id: ids.nodeId,
      threadId: ids.threadId,
      runId: ids.runId,
      parentNodeId: "node-0",
      origin: "app_owned",
      createdBy: "agent",
      driver: "codex",
      providerInstanceId: "sample-provider",
      providerThreadId: null,
      childThreadId: null,
      nativeTaskRef: null,
      prompt: "Sample",
      title: null,
      model: null,
      executedModel: "sample-model-2",
      cancelledRunId: "run-0",
      status: "cancelled",
      result: null,
      startedAt: null,
      completedAt: null,
      updatedAt: at,
    });
    expect(subagent).toMatchObject({ executedModel: "sample-model-2", cancelledRunId: "run-0" });
    rejects(OrchestrationV2Subagent, { ...subagent, executedModel: 1 });
    rejects(OrchestrationV2Subagent, { ...subagent, cancelledRunId: 1 });
    const task = OrchestrationV2PendingBackgroundTask.parse({
      taskId: "task-1",
      kind: "command",
      nativeItemId: "native-1",
    });
    expect(task.nativeItemId).toBe("native-1");
    rejects(OrchestrationV2PendingBackgroundTask, { taskId: "task-1", nativeItemId: " " });
    const metadata = OrchestrationV2ProviderThreadNativeMetadata.parse({
      cursorStoreCwd: "/srv/a",
    });
    expect(metadata.cursorStoreCwd).toBe("/srv/a");
    rejects(OrchestrationV2ProviderThreadNativeMetadata, { cursorStoreCwd: " " });
    const turn = {
      exposesNativeTurnId: true,
      emitsTurnStarted: true,
      emitsTurnCompleted: true,
      supportsInterrupt: true,
      supportsActiveSteering: true,
      activeSteeringDuringCompaction: false,
      supportsSteeringByInterruptRestart: false,
      supportsQueuedMessages: true,
      terminalStatusQuality: "strong",
    };
    expect(OrchestrationV2TurnCapabilities.parse(turn).activeSteeringDuringCompaction).toBe(false);
    rejects(OrchestrationV2TurnCapabilities, { ...turn, activeSteeringDuringCompaction: "no" });
  });

  it("keeps a checkpoint file path exactly as git reports it", () => {
    const summary = { path: " sample.txt ", kind: "modified", additions: 1, deletions: 0 };
    expect(OrchestrationV2CheckpointFileSummary.parse(summary).path).toBe(" sample.txt ");
    expect(OrchestrationV2CheckpointFileSummary.safeParse({ ...summary, path: "" }).success).toBe(
      false,
    );
  });

  it("sends the new command fields", () => {
    const dispatch = OrchestrationV2Command.parse({
      type: "message.dispatch",
      ...stamp,
      createdBy: "agent",
      creationSource: "mcp",
      messageId: ids.messageId,
      text: "Sample",
      attachments: [],
      linkedSender,
      steerFollowUpOfRunId: ids.runId,
      steerFollowUpAfterRunOrdinal: 1,
      dispatchMode: { type: "queue_after_active" },
    });
    expect(dispatch).toMatchObject({ linkedSender, steerFollowUpOfRunId: ids.runId });
    rejects(OrchestrationV2Command, { ...dispatch, steerFollowUpAfterRunOrdinal: -1 });
    rejects(OrchestrationV2Command, { ...dispatch, linkedSender: { threadId: "thread-9" } });
    expect(
      OrchestrationV2Command.parse({
        type: "thread.unsettle",
        ...stamp,
        reason: "user",
        restoreUnsettledAt: at,
      }),
    ).toMatchObject({ restoreUnsettledAt: at });
    rejects(OrchestrationV2Command, {
      type: "thread.unsettle",
      ...stamp,
      reason: "user",
      restoreUnsettledAt: 1,
    });
    rejects(OrchestrationV2Command, {
      type: "thread.metadata.update",
      ...stamp,
      continuation: { messageId: ids.messageId },
    });
    rejects(OrchestrationV2Command, {
      type: "thread.title.regeneration.complete",
      ...stamp,
      requestId: "command-0",
      outcome: { message: "No status." },
    });
    expect(
      OrchestrationV2Command.parse({
        type: "thread.metadata.update",
        ...stamp,
        worktreePath: "/srv/sample",
        continuation: { messageId: ids.messageId, text: "Continue." },
      }),
    ).toMatchObject({ continuation: { messageId: ids.messageId, text: "Continue." } });
    expect(
      OrchestrationV2Command.parse({
        type: "thread.title.regeneration.complete",
        ...stamp,
        requestId: "command-0",
        outcome: { status: "unchanged" },
      }),
    ).toMatchObject({ outcome: { status: "unchanged" } });
  });

  it("names the project identities a resumed shell subscription already holds", () => {
    expect(
      OrchestrationV2SubscribeShellInput.parse({ afterSequence: 4, knownProjectIdentities: "abc" }),
    ).toEqual({ afterSequence: 4, knownProjectIdentities: "abc" });
    rejects(OrchestrationV2SubscribeShellInput, { knownProjectIdentities: 1 });
  });

  it("reads whether someone renamed a project, as the recaptured shell fixture carries it", () => {
    expect(makeShellProject({ hasCustomTitle: true }).hasCustomTitle).toBe(true);
    expect(makeShellProject()).not.toHaveProperty("hasCustomTitle");
    expect(
      OrchestrationV2ShellSnapshot.parse(shellFixture).projects.map((p) => p.hasCustomTitle),
    ).toEqual([false]);
    rejects(OrchestrationProjectShell, { ...makeShellProject(), hasCustomTitle: "yes" });
  });
});
