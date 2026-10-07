// ---
// relationships:
//   implements: design
// ---
/** Runs, attempts, execution nodes, subagents, and checkpoints of `orchestrationV2.ts`. */
import { z } from "zod";
import {
  CheckpointId,
  CheckpointRef,
  CheckpointScopeId,
  ContextHandoffId,
  IsoDateTime,
  MessageId,
  NodeId,
  NonNegativeInt,
  PlanId,
  PositiveInt,
  ProviderDriverKind,
  ProviderInstanceId,
  ProviderThreadId,
  ProviderTurnId,
  RunAttemptId,
  RunId,
  RuntimeRequestId,
  ThreadId,
  TrimmedNonEmptyString,
  forwardCompatibleLiteral,
  taggedUnionWithUnknown,
} from "../common.ts";
import { ModelSelection, OrchestrationV2Actor, OrchestrationV2ProviderRef } from "./model.ts";

export const RUN_TERMINAL_STATUSES = [
  "completed",
  "interrupted",
  "failed",
  "cancelled",
  "rolled_back",
] as const;
export type OrchestrationV2RunTerminalStatus = (typeof RUN_TERMINAL_STATUSES)[number];
export const RUN_ACTIVE_STATUSES = [
  "preparing",
  "queued",
  "starting",
  "running",
  "waiting",
] as const;
export const OrchestrationV2RunStatus = forwardCompatibleLiteral([
  ...RUN_ACTIVE_STATUSES,
  ...RUN_TERMINAL_STATUSES,
]);
export type OrchestrationV2RunStatus = z.infer<typeof OrchestrationV2RunStatus>;

export function isRunTerminalStatus(status: string): status is OrchestrationV2RunTerminalStatus {
  return (RUN_TERMINAL_STATUSES as readonly string[]).includes(status);
}

/** Queued runs wait their turn; preparing, starting, running, and waiting runs hold the thread. */
export function isRunActiveStatus(status: string): boolean {
  return (RUN_ACTIVE_STATUSES as readonly string[]).includes(status);
}

export const OrchestrationV2DelegatedCompletionTaskDeliveryState = forwardCompatibleLiteral([
  "pending",
  "claimed",
  "acknowledged",
  "delivered",
  "disposed",
]);
export const OrchestrationV2DelegatedCompletionTaskDelivery = z.looseObject({
  state: OrchestrationV2DelegatedCompletionTaskDeliveryState,
  observedByRunId: RunId.nullable(),
});
export type OrchestrationV2DelegatedCompletionTaskDelivery = z.infer<
  typeof OrchestrationV2DelegatedCompletionTaskDelivery
>;
export const OrchestrationV2DelegatedCompletionDelivery = z.looseObject({
  generation: PositiveInt,
  messageId: MessageId,
  taskIds: z.array(NodeId),
});
export const OrchestrationV2DelegatedCompletionCohort = z.looseObject({
  disposition: forwardCompatibleLiteral(["open", "stopped", "disposed"]),
  nextGeneration: PositiveInt,
  delivery: OrchestrationV2DelegatedCompletionDelivery.nullable(),
});
export type OrchestrationV2DelegatedCompletionCohort = z.infer<
  typeof OrchestrationV2DelegatedCompletionCohort
>;

/** Background work that restart recovery cancelled; the next provider turn is told once. */
export const OrchestrationV2RestartCancelledBackgroundWork = z.looseObject({
  kind: forwardCompatibleLiteral(["subagent", "shell", "monitor", "task"]),
  label: TrimmedNonEmptyString,
  id: TrimmedNonEmptyString.optional(),
});
export type OrchestrationV2RestartCancelledBackgroundWork = z.infer<
  typeof OrchestrationV2RestartCancelledBackgroundWork
>;
export const OrchestrationV2RunBackgroundWorkCancelled = z.looseObject({
  runId: RunId,
  restartCancelledBackgroundWork: z.array(OrchestrationV2RestartCancelledBackgroundWork),
});
export type OrchestrationV2RunBackgroundWorkCancelled = z.infer<
  typeof OrchestrationV2RunBackgroundWorkCancelled
>;

const workspaceStrategyMembers = [
  z.looseObject({ type: z.literal("root"), branch: TrimmedNonEmptyString.optional() }),
  z.looseObject({
    type: z.literal("existing_worktree"),
    worktreePath: TrimmedNonEmptyString,
    branch: TrimmedNonEmptyString.optional(),
  }),
  z.looseObject({
    type: z.literal("worktree"),
    baseRef: TrimmedNonEmptyString,
    branch: TrimmedNonEmptyString.optional(),
    startFromOrigin: z.boolean().optional(),
  }),
] as const;
/** How a launch prepares a run's workspace; strict because callers send it. */
export const OrchestrationV2ThreadLaunchWorkspaceStrategy = z.discriminatedUnion(
  "type",
  workspaceStrategyMembers,
);
export type OrchestrationV2ThreadLaunchWorkspaceStrategy = z.infer<
  typeof OrchestrationV2ThreadLaunchWorkspaceStrategy
>;
/** The same strategy as a run records it; a newer kind decodes as unknown. */
export const OrchestrationV2WorkspacePreparation = taggedUnionWithUnknown(
  "type",
  workspaceStrategyMembers,
);
export type OrchestrationV2WorkspacePreparation = z.infer<
  typeof OrchestrationV2WorkspacePreparation
>;
/** Failure code on the error item a failed workspace preparation leaves. */
export const ORCHESTRATION_V2_WORKSPACE_PREPARATION_FAILURE_CODE = "workspace_preparation_failed";

export const OrchestrationV2Run = z.looseObject({
  id: RunId,
  threadId: ThreadId,
  ordinal: PositiveInt,
  providerInstanceId: ProviderInstanceId,
  modelSelection: ModelSelection,
  providerThreadId: ProviderThreadId.nullable(),
  userMessageId: MessageId,
  rootNodeId: NodeId.nullable(),
  activeAttemptId: RunAttemptId.nullable(),
  status: OrchestrationV2RunStatus,
  queuePosition: PositiveInt.nullable().optional(),
  queueHeld: z.boolean().optional(),
  requestedAt: IsoDateTime,
  startedAt: IsoDateTime.nullable(),
  completedAt: IsoDateTime.nullable(),
  checkpointId: CheckpointId.nullable(),
  contextHandoffId: ContextHandoffId.nullable(),
  restartContinuationOfRunId: RunId.optional(),
  /** When the work a wake run continues started; read it through `runWorkStartedAt`. */
  workStartedAt: IsoDateTime.optional(),
  restartCancelledBackgroundWork: z.array(OrchestrationV2RestartCancelledBackgroundWork).optional(),
  sourcePlanRef: z.looseObject({ threadId: ThreadId, planId: PlanId }).optional(),
  delegatedCompletion: OrchestrationV2DelegatedCompletionCohort.optional(),
  workspacePreparation: OrchestrationV2WorkspacePreparation.optional(),
});
export type OrchestrationV2Run = z.infer<typeof OrchestrationV2Run>;

/** When the work a run belongs to started: a wake continues earlier work. */
export function runWorkStartedAt(
  run: Pick<OrchestrationV2Run, "workStartedAt" | "startedAt" | "requestedAt">,
): string {
  return run.workStartedAt ?? run.startedAt ?? run.requestedAt;
}

export const OrchestrationV2RunAttempt = z.looseObject({
  id: RunAttemptId,
  nativeThreadId: z.string().optional(),
  runId: RunId,
  attemptOrdinal: PositiveInt,
  rootNodeId: NodeId,
  providerInstanceId: ProviderInstanceId,
  providerThreadId: ProviderThreadId,
  providerTurnId: ProviderTurnId.nullable(),
  reason: forwardCompatibleLiteral(["initial", "steering_restart", "retry", "provider_recovery"]),
  status: forwardCompatibleLiteral([
    "pending",
    "running",
    "completed",
    "interrupted",
    "failed",
    "cancelled",
    "superseded",
  ]),
  startedAt: IsoDateTime.nullable(),
  completedAt: IsoDateTime.nullable(),
});
export type OrchestrationV2RunAttempt = z.infer<typeof OrchestrationV2RunAttempt>;

export const OrchestrationV2ExecutionNodeStatus = forwardCompatibleLiteral([
  "idle",
  "pending",
  "running",
  "waiting",
  "completed",
  "interrupted",
  "failed",
  "cancelled",
  "rolled_back",
]);
export const OrchestrationV2ExecutionNode = z.looseObject({
  id: NodeId,
  threadId: ThreadId,
  runId: RunId.nullable(),
  parentNodeId: NodeId.nullable(),
  rootNodeId: NodeId,
  kind: forwardCompatibleLiteral([
    "root_turn",
    "assistant_message",
    "reasoning",
    "plan",
    "todo_list",
    "tool_call",
    "approval_request",
    "user_input_request",
    "subagent",
    "hook",
    "system",
  ]),
  status: OrchestrationV2ExecutionNodeStatus,
  countsForRun: z.boolean(),
  providerThreadId: ProviderThreadId.nullable(),
  providerTurnId: ProviderTurnId.nullable(),
  nativeItemRef: OrchestrationV2ProviderRef.nullable(),
  runtimeRequestId: RuntimeRequestId.nullable(),
  checkpointScopeId: CheckpointScopeId.nullable(),
  startedAt: IsoDateTime.nullable(),
  completedAt: IsoDateTime.nullable(),
});
export type OrchestrationV2ExecutionNode = z.infer<typeof OrchestrationV2ExecutionNode>;

/** Idle work is resumable, but does not keep a turn or its subscription alive. */
export function isOrchestrationV2WorkActive(status: string): boolean {
  return status === "pending" || status === "running" || status === "waiting";
}

export const OrchestrationV2Subagent = z.looseObject({
  id: NodeId,
  threadId: ThreadId,
  runId: RunId.nullable(),
  parentNodeId: NodeId,
  origin: forwardCompatibleLiteral(["provider_native", "app_owned"]),
  createdBy: OrchestrationV2Actor,
  driver: ProviderDriverKind,
  providerInstanceId: ProviderInstanceId,
  providerThreadId: ProviderThreadId.nullable(),
  childThreadId: ThreadId.nullable(),
  nativeTaskRef: OrchestrationV2ProviderRef.nullable(),
  prompt: z.string(),
  title: z.string().nullable(),
  model: z.string().nullable(),
  completionWake: forwardCompatibleLiteral(["always", "settled_only"]).optional(),
  completionDelivery: OrchestrationV2DelegatedCompletionTaskDelivery.optional(),
  status: forwardCompatibleLiteral([
    "idle",
    "pending",
    "running",
    "waiting",
    "completed",
    "failed",
    "cancelled",
    "interrupted",
  ]),
  progress: z.string().optional(),
  result: z.string().nullable(),
  startedAt: IsoDateTime.nullable(),
  completedAt: IsoDateTime.nullable(),
  updatedAt: IsoDateTime,
});
export type OrchestrationV2Subagent = z.infer<typeof OrchestrationV2Subagent>;

export const OrchestrationV2CheckpointScope = z.looseObject({
  id: CheckpointScopeId,
  threadId: ThreadId,
  runId: RunId.nullable(),
  nodeId: NodeId,
  parentScopeId: CheckpointScopeId.nullable(),
  providerThreadId: ProviderThreadId.nullable(),
  kind: forwardCompatibleLiteral(["root_run", "subagent", "tool", "provider_thread", "manual"]),
  ordinalWithinParent: NonNegativeInt,
  advancesAppRunCount: z.boolean(),
  cwd: TrimmedNonEmptyString,
  createdAt: IsoDateTime,
});
export type OrchestrationV2CheckpointScope = z.infer<typeof OrchestrationV2CheckpointScope>;

export const OrchestrationV2CheckpointFileSummary = z.looseObject({
  path: TrimmedNonEmptyString,
  kind: TrimmedNonEmptyString,
  additions: NonNegativeInt,
  deletions: NonNegativeInt,
});
export type OrchestrationV2CheckpointFileSummary = z.infer<
  typeof OrchestrationV2CheckpointFileSummary
>;

export const OrchestrationV2Checkpoint = z.looseObject({
  id: CheckpointId,
  threadId: ThreadId,
  scopeId: CheckpointScopeId,
  runId: RunId.nullable(),
  nodeId: NodeId,
  parentCheckpointId: CheckpointId.nullable(),
  ordinalWithinScope: NonNegativeInt,
  appRunOrdinal: PositiveInt.nullable(),
  ref: CheckpointRef,
  status: forwardCompatibleLiteral(["ready", "missing", "error", "stale"]),
  files: z.array(OrchestrationV2CheckpointFileSummary),
  capturedAt: IsoDateTime,
});
export type OrchestrationV2Checkpoint = z.infer<typeof OrchestrationV2Checkpoint>;

export const OrchestrationV2CheckpointRollbackRequest = z.looseObject({
  scopeId: CheckpointScopeId,
  checkpointId: CheckpointId,
  requestedAt: IsoDateTime,
});
export type OrchestrationV2CheckpointRollbackRequest = z.infer<
  typeof OrchestrationV2CheckpointRollbackRequest
>;
