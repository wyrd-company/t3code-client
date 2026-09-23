/**
 * Mirrors of the `packages/contracts/src/providerRuntime.ts` types that runtime
 * activity payloads carry. Only the parts the server copies into activities
 * are mirrored here.
 */
import { z } from "zod";
import {
  NonNegativeInt,
  PositiveInt,
  TrimmedNonEmptyString,
  forwardCompatibleArray,
  forwardCompatibleLiteral,
  taggedUnionWithUnknown,
} from "../../common.ts";

export const RuntimeItemId = TrimmedNonEmptyString.brand<"RuntimeItemId">();
export type RuntimeItemId = z.infer<typeof RuntimeItemId>;
export const RuntimeRequestId = TrimmedNonEmptyString.brand<"RuntimeRequestId">();
export type RuntimeRequestId = z.infer<typeof RuntimeRequestId>;
export const RuntimeTaskId = TrimmedNonEmptyString.brand<"RuntimeTaskId">();
export type RuntimeTaskId = z.infer<typeof RuntimeTaskId>;

export const ThreadTokenUsageSnapshot = z.looseObject({
  usedTokens: NonNegativeInt,
  totalProcessedTokens: NonNegativeInt.optional(),
  maxTokens: PositiveInt.optional(),
  inputTokens: NonNegativeInt.optional(),
  cachedInputTokens: NonNegativeInt.optional(),
  outputTokens: NonNegativeInt.optional(),
  reasoningOutputTokens: NonNegativeInt.optional(),
  lastUsedTokens: NonNegativeInt.optional(),
  lastInputTokens: NonNegativeInt.optional(),
  lastCachedInputTokens: NonNegativeInt.optional(),
  lastOutputTokens: NonNegativeInt.optional(),
  lastReasoningOutputTokens: NonNegativeInt.optional(),
  toolUses: NonNegativeInt.optional(),
  durationMs: NonNegativeInt.optional(),
  compactsAutomatically: z.boolean().optional(),
  autoCompactThreshold: PositiveInt.optional(),
});
export type ThreadTokenUsageSnapshot = z.infer<typeof ThreadTokenUsageSnapshot>;

export const RuntimePlanStepStatus = forwardCompatibleLiteral([
  "pending",
  "inProgress",
  "completed",
]);
export type RuntimePlanStepStatus = z.infer<typeof RuntimePlanStepStatus>;
export const RuntimePlanStep = z.looseObject({
  step: TrimmedNonEmptyString,
  status: RuntimePlanStepStatus,
});
export type RuntimePlanStep = z.infer<typeof RuntimePlanStep>;

export const RuntimeItemStatus = forwardCompatibleLiteral([
  "inProgress",
  "completed",
  "failed",
  "declined",
]);
export type RuntimeItemStatus = z.infer<typeof RuntimeItemStatus>;

export const TOOL_LIFECYCLE_ITEM_TYPES = [
  "command_execution",
  "file_change",
  "mcp_tool_call",
  "dynamic_tool_call",
  "collab_agent_tool_call",
  "web_search",
  "image_view",
] as const;
export const ToolLifecycleItemType = forwardCompatibleLiteral(TOOL_LIFECYCLE_ITEM_TYPES);
export type ToolLifecycleItemType = z.infer<typeof ToolLifecycleItemType>;

export const ToolActivitySurface = forwardCompatibleLiteral(["browser", "computer"]);
export type ToolActivitySurface = z.infer<typeof ToolActivitySurface>;

export const ToolActivityNativeAppReference = taggedUnionWithUnknown("_tag", [
  z.looseObject({
    _tag: z.literal("app-id"),
    appId: TrimmedNonEmptyString.max(512).regex(/^[A-Za-z0-9._-]+$/u),
  }),
  z.looseObject({
    _tag: z.literal("display-name"),
    displayName: TrimmedNonEmptyString.max(160),
  }),
]);
export type ToolActivityNativeAppReference = z.infer<typeof ToolActivityNativeAppReference>;

export const ToolActivityIcon = taggedUnionWithUnknown("_tag", [
  z.looseObject({
    _tag: z.literal("website"),
    pageUrl: TrimmedNonEmptyString.max(4096),
    faviconUrl: TrimmedNonEmptyString.max(4096).optional(),
    faviconUrlDark: TrimmedNonEmptyString.max(4096).optional(),
  }),
  z.looseObject({
    _tag: z.literal("native-app"),
    app: ToolActivityNativeAppReference,
  }),
  z.looseObject({
    _tag: z.literal("themed-logo"),
    logoUrl: TrimmedNonEmptyString.max(4096),
    logoUrlDark: TrimmedNonEmptyString.max(4096).optional(),
  }),
]);
export type ToolActivityIcon = z.infer<typeof ToolActivityIcon>;

export const ToolActivitySource = z.looseObject({
  key: TrimmedNonEmptyString.max(512),
  name: TrimmedNonEmptyString.max(160),
  kind: forwardCompatibleLiteral(["browser", "computer", "integration"]),
  icon: ToolActivityIcon.optional(),
});
export type ToolActivitySource = z.infer<typeof ToolActivitySource>;

export const RuntimeTaskUsage = z.looseObject({
  totalTokens: NonNegativeInt,
  inputTokens: NonNegativeInt.optional(),
  cachedInputTokens: NonNegativeInt.optional(),
  outputTokens: NonNegativeInt.optional(),
  reasoningOutputTokens: NonNegativeInt.optional(),
  toolUses: NonNegativeInt.optional(),
  durationMs: NonNegativeInt.optional(),
});
export type RuntimeTaskUsage = z.infer<typeof RuntimeTaskUsage>;

export const TaskWorkflowPhase = z.looseObject({
  index: NonNegativeInt,
  title: TrimmedNonEmptyString,
});
export type TaskWorkflowPhase = z.infer<typeof TaskWorkflowPhase>;

export const TaskRunHandles = z.looseObject({
  runId: TrimmedNonEmptyString.optional(),
  scriptPath: TrimmedNonEmptyString.optional(),
  transcriptDir: TrimmedNonEmptyString.optional(),
  sessionUrl: TrimmedNonEmptyString.optional(),
});
export type TaskRunHandles = z.infer<typeof TaskRunHandles>;

export const RuntimeTaskStatus = forwardCompatibleLiteral([
  "pending",
  "running",
  "waiting",
  "idle",
  "completed",
  "failed",
  "cancelled",
  "interrupted",
]);
export type RuntimeTaskStatus = z.infer<typeof RuntimeTaskStatus>;

export const TaskAgentKind = forwardCompatibleLiteral(["agent", "background"]);
export type TaskAgentKind = z.infer<typeof TaskAgentKind>;

/** The contracts' `TaskAgentLinkage` fields, as ingestion copies them onto task activities. */
export const taskAgentLinkageFields = {
  taskType: TrimmedNonEmptyString.optional(),
  // Stamped on every task row by this server; rows persisted before the stamp lack it.
  agentKind: TaskAgentKind.optional(),
  agentId: TrimmedNonEmptyString.optional(),
  title: TrimmedNonEmptyString.optional(),
  role: TrimmedNonEmptyString.optional(),
  model: TrimmedNonEmptyString.optional(),
  effort: TrimmedNonEmptyString.optional(),
  toolUseId: TrimmedNonEmptyString.optional(),
  parentAgentId: TrimmedNonEmptyString.optional(),
  workflowName: TrimmedNonEmptyString.optional(),
  agentIndex: NonNegativeInt.optional(),
  phaseIndex: NonNegativeInt.optional(),
  phaseTitle: TrimmedNonEmptyString.optional(),
  phases: forwardCompatibleArray(TaskWorkflowPhase).optional(),
  attempt: NonNegativeInt.optional(),
  runHandles: TaskRunHandles.optional(),
  outputFile: TrimmedNonEmptyString.optional(),
  agentPath: TrimmedNonEmptyString.optional(),
  timelineBypass: z.boolean().optional(),
} as const;
