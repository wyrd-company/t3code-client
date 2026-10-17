// ---
// relationships:
//   implements: library
// ---
/** Provider sessions, threads, turns, and runtime requests of `orchestrationV2.ts`. */
import { z } from "zod";
import {
  ContextHandoffId,
  IsoDateTime,
  NodeId,
  NonNegativeInt,
  PositiveInt,
  ProviderDriverKind,
  ProviderInstanceId,
  ProviderSessionId,
  ProviderThreadId,
  ProviderTurnId,
  RunAttemptId,
  RuntimeRequestId,
  ThreadId,
  TrimmedNonEmptyString,
  forwardCompatibleLiteral,
  taggedUnionWithUnknown,
} from "../common.ts";
import {
  ModelSelection,
  OrchestrationV2ProviderRef,
  ProviderApprovalDecision,
  ProviderUserInputAnswers,
} from "./model.ts";
import { OrchestrationV2ProviderCapabilities } from "./providerCapabilities.ts";
import { ThreadTokenUsageSnapshot, TurnTokenUsage } from "./providerRuntime.ts";

export { OrchestrationV2ProviderCapabilities } from "./providerCapabilities.ts";

export const OrchestrationV2ProviderSession = z.looseObject({
  id: ProviderSessionId,
  driver: ProviderDriverKind,
  providerInstanceId: ProviderInstanceId,
  status: forwardCompatibleLiteral(["starting", "ready", "running", "waiting", "stopped", "error"]),
  cwd: TrimmedNonEmptyString,
  model: TrimmedNonEmptyString.nullable(),
  capabilities: OrchestrationV2ProviderCapabilities,
  createdAt: IsoDateTime,
  updatedAt: IsoDateTime,
  lastError: z.string().nullable(),
});
export type OrchestrationV2ProviderSession = z.infer<typeof OrchestrationV2ProviderSession>;

export const OrchestrationV2ProviderSessionDetached = z.looseObject({
  providerSessionId: ProviderSessionId,
  detachedAt: IsoDateTime,
  reason: z.string().optional(),
});
export type OrchestrationV2ProviderSessionDetached = z.infer<
  typeof OrchestrationV2ProviderSessionDetached
>;

const pendingBackgroundTaskKinds = ["subagent", "command", "monitor", "background_task"] as const;
/**
 * Provider-owned background work that can outlive the root turn. A kind this
 * build does not know, or none, loads as `background_task`, as upstream does.
 */
export const OrchestrationV2PendingBackgroundTask = z
  .looseObject({
    taskId: TrimmedNonEmptyString,
    description: TrimmedNonEmptyString.optional(),
    kind: z.string().optional(),
    childThreadId: ThreadId.optional(),
  })
  .transform((task) => ({
    ...task,
    kind: (pendingBackgroundTaskKinds as readonly string[]).includes(task.kind ?? "")
      ? (task.kind as (typeof pendingBackgroundTaskKinds)[number])
      : ("background_task" as const),
  }));
export type OrchestrationV2PendingBackgroundTask = z.infer<
  typeof OrchestrationV2PendingBackgroundTask
>;

export const OrchestrationV2ProviderThreadNativeMetadata = z.looseObject({
  modelSelection: ModelSelection.optional(),
  title: TrimmedNonEmptyString.nullable().optional(),
  updatedAt: TrimmedNonEmptyString.nullable().optional(),
  itemIdentityVersion: z.literal(2).optional(),
});
export type OrchestrationV2ProviderThreadNativeMetadata = z.infer<
  typeof OrchestrationV2ProviderThreadNativeMetadata
>;

export const OrchestrationV2ProviderGoalStatus = forwardCompatibleLiteral([
  "active",
  "paused",
  "blocked",
  "usage_limited",
  "budget_limited",
  "complete",
]);
/** A provider-native goal; the provider owns this state and T3 mirrors its latest report. */
export const OrchestrationV2ProviderGoal = z.looseObject({
  objective: TrimmedNonEmptyString,
  status: OrchestrationV2ProviderGoalStatus,
  tokensUsed: NonNegativeInt.optional(),
  tokenBudget: NonNegativeInt.nullable().optional(),
  timeUsedSeconds: NonNegativeInt.optional(),
  checks: NonNegativeInt.optional(),
  lastCheck: z.string().optional(),
});
export type OrchestrationV2ProviderGoal = z.infer<typeof OrchestrationV2ProviderGoal>;

export const OrchestrationV2ProviderThread = z.looseObject({
  id: ProviderThreadId,
  driver: ProviderDriverKind,
  providerInstanceId: ProviderInstanceId,
  providerSessionId: ProviderSessionId.nullable(),
  appThreadId: ThreadId.nullable(),
  ownerNodeId: NodeId.nullable(),
  nativeThreadRef: OrchestrationV2ProviderRef.nullable(),
  nativeConversationHeadRef: OrchestrationV2ProviderRef.nullable(),
  status: forwardCompatibleLiteral(["not_loaded", "idle", "active", "archived", "closed", "error"]),
  firstRunOrdinal: PositiveInt.nullable(),
  lastRunOrdinal: PositiveInt.nullable(),
  handoffIds: z.array(ContextHandoffId),
  forkedFrom: z
    .looseObject({
      providerThreadId: ProviderThreadId,
      providerTurnId: ProviderTurnId.optional(),
      checkpointId: TrimmedNonEmptyString.optional(),
    })
    .nullable(),
  pendingBackgroundTasks: z.array(OrchestrationV2PendingBackgroundTask).default([]),
  contextUsage: ThreadTokenUsageSnapshot.nullable().default(null),
  nativeMetadata: OrchestrationV2ProviderThreadNativeMetadata.nullable().default(null),
  goal: OrchestrationV2ProviderGoal.nullable().default(null),
  createdAt: IsoDateTime,
  updatedAt: IsoDateTime,
});
export type OrchestrationV2ProviderThread = z.infer<typeof OrchestrationV2ProviderThread>;

/** Live context usage reported by the provider mid-turn. */
export const OrchestrationV2ProviderTurnTokenUsage = z.looseObject({
  usedTokens: NonNegativeInt,
  maxTokens: NonNegativeInt.nullable().optional(),
  inputTokens: NonNegativeInt.optional(),
  cachedInputTokens: NonNegativeInt.optional(),
  outputTokens: NonNegativeInt.optional(),
  reasoningOutputTokens: NonNegativeInt.optional(),
  /** Prompt cache lifetime; the cache is cold once `updatedAt` is this old. */
  promptCacheTtlMs: PositiveInt.optional(),
  updatedAt: z.string(),
});
export type OrchestrationV2ProviderTurnTokenUsage = z.infer<
  typeof OrchestrationV2ProviderTurnTokenUsage
>;

export const OrchestrationV2ProviderTurn = z.looseObject({
  id: ProviderTurnId,
  providerThreadId: ProviderThreadId,
  nodeId: NodeId,
  runAttemptId: RunAttemptId.nullable(),
  nativeTurnRef: OrchestrationV2ProviderRef.nullable(),
  ordinal: PositiveInt,
  status: forwardCompatibleLiteral([
    "pending",
    "running",
    "completed",
    "interrupted",
    "failed",
    "cancelled",
  ]),
  startedAt: IsoDateTime.nullable(),
  completedAt: IsoDateTime.nullable(),
  tokenUsage: OrchestrationV2ProviderTurnTokenUsage.optional(),
  turnTokenUsage: TurnTokenUsage.optional(),
});
export type OrchestrationV2ProviderTurn = z.infer<typeof OrchestrationV2ProviderTurn>;

export const OrchestrationV2RuntimeRequestKind = forwardCompatibleLiteral([
  "command",
  "file-read",
  "file-change",
  "mcp-elicitation",
  "permission",
  "dynamic_tool_call",
  "user_input",
  "auth_refresh",
]);
export type OrchestrationV2RuntimeRequestKind = z.infer<typeof OrchestrationV2RuntimeRequestKind>;
export const OrchestrationV2RuntimeRequestStatus = forwardCompatibleLiteral([
  "pending",
  "resolved",
  "expired",
  "cancelled",
]);
export const OrchestrationV2RuntimeRequestResponseCapability = taggedUnionWithUnknown("type", [
  z.looseObject({ type: z.literal("live"), providerSessionId: ProviderSessionId }),
  z.looseObject({ type: z.literal("message") }),
  z.looseObject({ type: z.literal("not_resumable"), reason: z.string() }),
]);
/** An approval, question, or other request the provider raised and how it was answered. */
export const OrchestrationV2RuntimeRequest = z.looseObject({
  id: RuntimeRequestId,
  nodeId: NodeId,
  providerTurnId: ProviderTurnId.nullable(),
  nativeRequestRef: OrchestrationV2ProviderRef.nullable(),
  kind: OrchestrationV2RuntimeRequestKind,
  status: OrchestrationV2RuntimeRequestStatus,
  responseCapability: OrchestrationV2RuntimeRequestResponseCapability,
  createdAt: IsoDateTime,
  resolvedAt: IsoDateTime.nullable(),
  decision: ProviderApprovalDecision.optional(),
  answers: ProviderUserInputAnswers.optional(),
});
export type OrchestrationV2RuntimeRequest = z.infer<typeof OrchestrationV2RuntimeRequest>;
