// ---
// relationships:
//   verifies: library
// ---
import { describe, expect, it } from "vite-plus/test";
import {
  at,
  ids,
  makeAppThread,
  makeProjection,
  makeRun,
  makeShellThread,
  makeTurnItem,
  parseEvent,
  rawEvent,
} from "../../../test/support/threadFixtures.ts";
import { applyThreadEvent } from "../../api/threadProjection.ts";
import { OrchestrationV2CheckpointScope } from "./checkpoints.ts";
import { OrchestrationV2Command } from "./commands.ts";
import { OrchestrationV2ToolCapabilities } from "./providerCapabilities.ts";
import {
  OrchestrationV2ProviderSession,
  OrchestrationV2ProviderTurn,
  isDeliveredProviderTurn,
} from "./providerState.ts";
import {
  OrchestrationV2Run,
  OrchestrationV2RunAttempt,
  OrchestrationV2ThreadLaunchWorkspaceStrategy,
} from "./runs.ts";
import { OrchestrationV2AppThread, isListedThreadLineage } from "./thread.ts";
import { OrchestrationV2ProviderFailure } from "./turnItemParts.ts";
import { OrchestrationV2TurnItem } from "./turnItems.ts";

const workflowRun = {
  environmentId: "environment-1",
  runId: "workflow-run-1",
  workflow: "sample-workflow",
  step: "review",
};
const output = { value: { summary: "done", count: 2 }, submittedAt: at };

/** A loose object passes unknown keys through, so a typed field shows by refusing a bad value. */
function rejects(schema: { safeParse(value: unknown): { success: boolean } }, value: unknown) {
  expect(schema.safeParse(value).success).toBe(false);
}

describe("orchestration field changes of 0.1.12", () => {
  it("reads a workflow step's origin on the thread and its shell, and keeps it out of lists", () => {
    const lineage = {
      parentThreadId: null,
      relationshipToParent: null,
      rootThreadId: ids.threadId,
    };
    const thread = OrchestrationV2AppThread.parse(
      makeAppThread({ workflowRun, lineage: { ...lineage, workflowStep: true } }),
    );
    expect(thread.workflowRun).toEqual(workflowRun);
    expect(makeShellThread({ workflowRun }).workflowRun).toEqual(workflowRun);
    expect(isListedThreadLineage(thread.lineage)).toBe(false);
    expect(isListedThreadLineage(lineage)).toBe(true);
    expect(isListedThreadLineage({ ...lineage, sideChat: true })).toBe(false);
    expect(isListedThreadLineage({ ...lineage, relationshipToParent: "subagent" })).toBe(false);
    rejects(OrchestrationV2AppThread, makeAppThread({ workflowRun: { ...workflowRun, step: "" } }));
  });

  it("reads the repositories a rewind left unrestored", () => {
    const rollbackUnrestored = { requestId: "command-1", repositories: ["/srv/sample/lib"] };
    expect(
      OrchestrationV2AppThread.parse(makeAppThread({ rollbackUnrestored })).rollbackUnrestored,
    ).toEqual(rollbackUnrestored);
    expect(
      OrchestrationV2AppThread.parse(makeAppThread({ rollbackUnrestored: null }))
        .rollbackUnrestored,
    ).toBeNull();
    rejects(OrchestrationV2AppThread, makeAppThread({ rollbackUnrestored: { requestId: "c" } }));
  });

  it("chooses tracked repositories for a worktree launch, at most 128", () => {
    const strategy = { type: "worktree", baseRef: "main", repositories: [{ path: "/srv/lib" }] };
    expect(OrchestrationV2ThreadLaunchWorkspaceStrategy.parse(strategy)).toEqual(strategy);
    const many = Array.from({ length: 129 }, (_, index) => ({ path: `/srv/r${index}` }));
    rejects(OrchestrationV2ThreadLaunchWorkspaceStrategy, { ...strategy, repositories: many });
    rejects(OrchestrationV2ThreadLaunchWorkspaceStrategy, { ...strategy, repositories: [{}] });
  });

  it("reads a run's output schema and output, and an attempt's starting modes", () => {
    const outputSchema = { type: "object", required: ["summary"] };
    const run = OrchestrationV2Run.parse(makeRun({ outputSchema, output }));
    expect(run.outputSchema).toEqual(outputSchema);
    expect(run.output).toEqual(output);
    rejects(OrchestrationV2Run, makeRun({ output: { value: 1 } }));
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
      startedModes: { runtimeMode: "approval-required", interactionMode: "plan" },
    };
    expect(OrchestrationV2RunAttempt.parse(attempt).startedModes).toEqual(attempt.startedModes);
    rejects(OrchestrationV2RunAttempt, { ...attempt, startedModes: { runtimeMode: 1 } });
  });

  it("applies a submitted output, and keeps it through a later run update without one", () => {
    let projection = makeProjection({ runs: [makeRun()] });
    projection = applyThreadEvent(
      projection,
      parseEvent(rawEvent(2, "run.output-submitted", { runId: ids.runId, output })),
    );
    expect(projection.runs[0]?.output).toEqual(output);
    projection = applyThreadEvent(
      projection,
      parseEvent(rawEvent(3, "run.updated", makeRun({ status: "completed" }))),
    );
    expect(projection.runs[0]).toMatchObject({ status: "completed", output });
    const other = applyThreadEvent(
      projection,
      parseEvent(rawEvent(4, "run.output-submitted", { runId: "run-9", output })),
    );
    expect(other).toBe(projection);
  });

  it("reads repository checkpoint scopes, provider startup phases and dropped prompts", () => {
    const scope = {
      id: "scope-1",
      threadId: ids.threadId,
      runId: ids.runId,
      nodeId: ids.nodeId,
      parentScopeId: "scope-0",
      providerThreadId: null,
      kind: "manual",
      ordinalWithinParent: 0,
      advancesAppRunCount: false,
      cwd: "/srv/sample/lib",
      label: "lib",
      repositoryPath: "/srv/sample/lib",
      createdAt: at,
    };
    expect(OrchestrationV2CheckpointScope.parse(scope)).toMatchObject({
      label: "lib",
      repositoryPath: "/srv/sample/lib",
    });
    rejects(OrchestrationV2CheckpointScope, { ...scope, repositoryPath: " " });
    const turn = {
      id: "provider-turn-1",
      providerThreadId: "provider-thread-1",
      runAttemptId: "attempt-1",
      nodeId: ids.nodeId,
      nativeTurnRef: null,
      ordinal: 1,
      status: "completed",
      startedAt: at,
      completedAt: at,
      promptDropped: true,
    };
    expect(isDeliveredProviderTurn(OrchestrationV2ProviderTurn.parse(turn))).toBe(false);
    expect(isDeliveredProviderTurn({})).toBe(true);
    expect(OrchestrationV2ProviderTurn.shape.promptDropped.safeParse(false).success).toBe(false);
    const phase = OrchestrationV2ProviderSession.shape.startupPhase;
    expect(phase.parse("plugins")).toBe("plugins");
    rejects(phase, "x".repeat(65));
    expect(OrchestrationV2ProviderSession.shape.startupPhaseThreadId.parse("thread-2")).toBe(
      "thread-2",
    );
    const tools = {
      exposesToolItemIds: true,
      emitsToolStarted: true,
      emitsToolCompleted: true,
      emitsToolOutput: true,
      supportsMcpTools: true,
      supportsDynamicToolCallbacks: false,
    };
    expect(
      OrchestrationV2ToolCapabilities.parse({ ...tools, supportsBackgroundWait: true })
        .supportsBackgroundWait,
    ).toBe(true);
    rejects(OrchestrationV2ToolCapabilities, { ...tools, supportsBackgroundWait: "yes" });
  });

  it("accepts only a Google account continue page as a failure's verification address", () => {
    const failure = { class: "auth", message: "Verify.", code: null, retryable: false };
    for (const url of [
      "https://accounts.google.com/signin/continue?sarp=1",
      "https://accounts.google.com/v3/signin/continue?sarp=1&scc=1",
    ]) {
      expect(OrchestrationV2ProviderFailure.parse({ ...failure, verificationUrl: url })).toEqual({
        ...failure,
        verificationUrl: url,
      });
    }
    for (const url of [
      "http://accounts.google.com/signin/continue?sarp=1",
      "https://accounts.google.com.invalid/signin/continue?sarp=1",
      "https://accounts.google.com/signin/continue?a#b",
      "javascript:alert(1)",
    ]) {
      rejects(OrchestrationV2ProviderFailure, { ...failure, verificationUrl: url });
    }
  });

  it("reads MCP sign-in notices, async replies, multi-value secret cards and feedback cards", () => {
    const notice = makeTurnItem("system_notice", {
      message: "Sign in to sample.",
      mcpSignIn: { server: "sample" },
    });
    expect(OrchestrationV2TurnItem.parse(notice)).toMatchObject({
      mcpSignIn: { server: "sample" },
    });
    const reply = makeTurnItem("assistant_message", {
      messageId: "message-2",
      text: "Working on it.",
      streaming: false,
      delivery: "async",
    });
    expect(OrchestrationV2TurnItem.parse(reply)).toMatchObject({ delivery: "async" });
    const fields = [
      { name: "user", label: "Email", secret: false },
      { name: "password", label: "Password", placeholder: "secret" },
    ];
    const secret = makeTurnItem("secret_request", {
      label: "Sample sign-in",
      reason: "To sign in.",
      secretStatus: "pending",
      fields,
    });
    expect(OrchestrationV2TurnItem.parse(secret)).toMatchObject({ fields });
    rejects(OrchestrationV2TurnItem, { ...secret, fields: [{ name: "user" }] });
    const preview = {
      kind: "bug",
      subject: "Sample subject",
      expected: "It works.",
      actual: "It fails.",
      workaround: "",
      trace: { turns: 1, textTurns: 1, truncated: false, entries: [{ turn: 1, type: "tool" }] },
    };
    const feedback = makeTurnItem("feedback_request", { preview, feedbackStatus: "pending" });
    const parsed = OrchestrationV2TurnItem.parse(feedback);
    expect(parsed).toMatchObject({ type: "feedback_request", preview, feedbackStatus: "pending" });
    expect(parsed).not.toHaveProperty("unknown");
    rejects(OrchestrationV2TurnItem, { ...feedback, preview: { ...preview, subject: 1 } });
  });

  it("sends an output schema on a message, a model on a queued edit, and a kept title", () => {
    const stamp = { commandId: "command-1", threadId: ids.threadId };
    const outputSchema = { type: "object" };
    expect(
      OrchestrationV2Command.parse({
        type: "message.dispatch",
        createdBy: "user",
        creationSource: "cli",
        ...stamp,
        messageId: "message-1",
        text: "Answer as data.",
        attachments: [],
        dispatchMode: { type: "start_immediately" },
        outputSchema,
      }),
    ).toMatchObject({ outputSchema });
    const modelSelection = { instanceId: "sample-provider", model: "sample-model" };
    expect(
      OrchestrationV2Command.parse({
        type: "queued-run.edit",
        ...stamp,
        runId: ids.runId,
        text: "Edited.",
        modelSelection,
      }),
    ).toMatchObject({ modelSelection });
    const create = {
      type: "thread.create",
      createdBy: "user",
      creationSource: "cli",
      ...stamp,
      projectId: ids.projectId,
      title: "Named by hand",
      titleRenamed: true,
      modelSelection,
      runtimeMode: "auto",
      interactionMode: "default",
      branch: null,
      worktreePath: null,
    };
    expect(OrchestrationV2Command.parse(create)).toMatchObject({ titleRenamed: true });
    rejects(OrchestrationV2Command, { ...create, titleRenamed: "yes" });
  });
});
