/**
 * Payloads of the activities the server derives from provider runtime events
 * (`ProviderRuntimeIngestion`), in the shape clients receive them.
 *
 * `approval.*` and `user-input.*` are also built there; their schemas live in
 * `../activities.ts` with the rest of the request lifecycle.
 */
import { z } from "zod";
import { NonNegativeInt, TrimmedNonEmptyString, forwardCompatibleArray } from "../../common.ts";
import {
  RuntimePlanStep,
  RuntimeRequestId,
  RuntimeTaskId,
  ThreadTokenUsageSnapshot,
} from "./providerRuntime.ts";
import {
  TaskCompletedActivityPayload,
  TaskProgressActivityPayload,
  TaskStartedActivityPayload,
  TaskUpdatedActivityPayload,
} from "./task.ts";
import {
  ToolCompletedActivityPayload,
  ToolStartedActivityPayload,
  ToolUpdatedActivityPayload,
} from "./toolLifecycle.ts";

export {
  TaskCompletedActivityPayload,
  TaskProgressActivityPayload,
  TaskStartedActivityPayload,
  TaskUpdatedActivityPayload,
  ToolCompletedActivityPayload,
  ToolStartedActivityPayload,
  ToolUpdatedActivityPayload,
};

export const RuntimeErrorActivityPayload = z.looseObject({
  message: TrimmedNonEmptyString,
});
export type RuntimeErrorActivityPayload = z.infer<typeof RuntimeErrorActivityPayload>;

export const RuntimeWarningActivityPayload = z.looseObject({
  message: TrimmedNonEmptyString,
  // Provider-specific context; the contracts leave it opaque.
  detail: z.unknown().optional(),
});
export type RuntimeWarningActivityPayload = z.infer<typeof RuntimeWarningActivityPayload>;

export const ToolDeniedActivityPayload = z.looseObject({
  toolName: TrimmedNonEmptyString,
  toolUseId: TrimmedNonEmptyString.optional(),
  /** The provider's denial reason. */
  detail: TrimmedNonEmptyString.optional(),
  agentId: TrimmedNonEmptyString.optional(),
});
export type ToolDeniedActivityPayload = z.infer<typeof ToolDeniedActivityPayload>;

/** Latest heartbeat of a tool running inside a subagent. The server keeps one row per task. */
export const ToolProgressActivityPayload = z.looseObject({
  taskId: RuntimeTaskId,
  toolName: TrimmedNonEmptyString.optional(),
  toolUseId: TrimmedNonEmptyString.optional(),
  elapsedSeconds: z.number().optional(),
  parentToolUseId: TrimmedNonEmptyString.optional(),
});
export type ToolProgressActivityPayload = z.infer<typeof ToolProgressActivityPayload>;

export const TurnPlanUpdatedActivityPayload = z.looseObject({
  plan: forwardCompatibleArray(RuntimePlanStep),
  explanation: TrimmedNonEmptyString.nullable().optional(),
});
export type TurnPlanUpdatedActivityPayload = z.infer<typeof TurnPlanUpdatedActivityPayload>;

export const ContextCompactionActivityPayload = z.looseObject({
  state: z.literal("compacted"),
  beforeTokens: NonNegativeInt.optional(),
  afterTokens: NonNegativeInt.optional(),
  /** The `/compact` message id when a user message started the compaction. */
  requestId: RuntimeRequestId.optional(),
  // Provider-specific context; the contracts leave it opaque.
  detail: z.unknown().optional(),
});
export type ContextCompactionActivityPayload = z.infer<typeof ContextCompactionActivityPayload>;

export const ContextWindowUpdatedActivityPayload = ThreadTokenUsageSnapshot;
export type ContextWindowUpdatedActivityPayload = z.infer<
  typeof ContextWindowUpdatedActivityPayload
>;

export const runtimeActivityPayloads = {
  "runtime.error": RuntimeErrorActivityPayload,
  "runtime.warning": RuntimeWarningActivityPayload,
  "tool.denied": ToolDeniedActivityPayload,
  "turn.plan.updated": TurnPlanUpdatedActivityPayload,
  "task.started": TaskStartedActivityPayload,
  "task.progress": TaskProgressActivityPayload,
  "task.updated": TaskUpdatedActivityPayload,
  "task.completed": TaskCompletedActivityPayload,
  "tool.progress": ToolProgressActivityPayload,
  "tool.started": ToolStartedActivityPayload,
  "tool.updated": ToolUpdatedActivityPayload,
  "tool.completed": ToolCompletedActivityPayload,
  "context-compaction": ContextCompactionActivityPayload,
  "context-window.updated": ContextWindowUpdatedActivityPayload,
} as const satisfies Record<string, z.ZodType>;
