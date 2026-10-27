// ---
// relationships:
//   implements: library
// ---
/**
 * Mirrors `packages/contracts/src/scheduledTask.ts`: scheduled tasks, their
 * webhook endpoints and webhook delivery records. Trigger schemas live in
 * `scheduledTaskSchedule.ts`.
 */
import { z } from "zod";
import {
  CommandId,
  IsoDateTime,
  NonNegativeInt,
  ProjectId,
  ScheduledTaskId,
  ThreadId,
  TrimmedNonEmptyString,
  forwardCompatibleArray,
  forwardCompatibleLiteral,
  stringRecord,
} from "./common.ts";
import {
  ModelSelection,
  OrchestrationV2Actor,
  OrchestrationV2CreationSource,
  ProviderInteractionMode,
  RuntimeMode,
} from "./orchestration/model.ts";
import { OrchestrationV2ThreadLaunchWorkspaceStrategy } from "./orchestration/runs.ts";
import { ScheduledTaskSchedule, ScheduledTaskUpsertSchedule } from "./scheduledTaskSchedule.ts";

export * from "./scheduledTaskSchedule.ts";

export const ScheduledTaskRunStatus = forwardCompatibleLiteral([
  "never",
  "running",
  "succeeded",
  "failed",
]);
export type ScheduledTaskRunStatus = z.infer<typeof ScheduledTaskRunStatus>;

/**
 * A webhook task's endpoint. `path` carries the URL token and is relative to
 * the environment; `url` is the T3 Connect relay URL, null without one. The
 * server removes the whole endpoint for a caller without orchestration:operate.
 */
export const ScheduledTaskWebhookEndpoint = z.looseObject({
  path: TrimmedNonEmptyString,
  url: TrimmedNonEmptyString.nullable(),
  hasSecret: z.boolean(),
});
export type ScheduledTaskWebhookEndpoint = z.infer<typeof ScheduledTaskWebhookEndpoint>;

export const ScheduledTask = z.looseObject({
  id: ScheduledTaskId,
  title: TrimmedNonEmptyString,
  prompt: TrimmedNonEmptyString,
  enabled: z.boolean(),
  schedule: ScheduledTaskSchedule,
  projectId: ProjectId,
  threadId: ThreadId.nullable(),
  workspaceStrategy: OrchestrationV2ThreadLaunchWorkspaceStrategy,
  modelSelection: ModelSelection,
  runtimeMode: RuntimeMode,
  interactionMode: ProviderInteractionMode,
  createdBy: OrchestrationV2Actor,
  creationSource: OrchestrationV2CreationSource,
  createdAt: IsoDateTime,
  updatedAt: IsoDateTime,
  nextRunAt: IsoDateTime.nullable(),
  lastRunAt: IsoDateTime.nullable(),
  lastRunStatus: ScheduledTaskRunStatus,
  lastRunError: z.string().nullable(),
  runCount: NonNegativeInt,
  webhook: ScheduledTaskWebhookEndpoint.optional(),
});
export type ScheduledTask = z.infer<typeof ScheduledTask>;

export const ScheduledTaskListResult = z.looseObject({
  // A task the client cannot decode is dropped rather than failing the list.
  tasks: forwardCompatibleArray(ScheduledTask),
});
export type ScheduledTaskListResult = z.infer<typeof ScheduledTaskListResult>;

export const ScheduledTaskUpsertInput = z.looseObject({
  /** Omit to create a task; the server derives an id. */
  id: ScheduledTaskId.optional(),
  /** Reject the save when the task no longer exists. */
  requireExisting: z.boolean().optional(),
  commandId: CommandId.optional(),
  title: TrimmedNonEmptyString,
  prompt: TrimmedNonEmptyString,
  enabled: z.boolean(),
  schedule: ScheduledTaskUpsertSchedule,
  projectId: ProjectId,
  /** Omit or null to start a new thread per run. */
  threadId: ThreadId.nullable().optional(),
  workspaceStrategy: OrchestrationV2ThreadLaunchWorkspaceStrategy,
  modelSelection: ModelSelection,
  runtimeMode: RuntimeMode,
  interactionMode: ProviderInteractionMode,
  createdBy: OrchestrationV2Actor.optional(),
  creationSource: OrchestrationV2CreationSource.optional(),
});
export type ScheduledTaskUpsertInput = z.infer<typeof ScheduledTaskUpsertInput>;

export const ScheduledTaskIdInput = z.looseObject({ id: ScheduledTaskId });
export const ScheduledTaskSetEnabledInput = z.looseObject({
  id: ScheduledTaskId,
  enabled: z.boolean(),
});
export const ScheduledTaskMutationResult = z.looseObject({ task: ScheduledTask });
export const ScheduledTaskDeleteResult = z.looseObject({ id: ScheduledTaskId });

export const ScheduledTaskWebhookDeliveryId = TrimmedNonEmptyString.brand(
  "ScheduledTaskWebhookDeliveryId",
);
export type ScheduledTaskWebhookDeliveryId = z.infer<typeof ScheduledTaskWebhookDeliveryId>;

/** What happened to one webhook request. The set grows; newer outcomes stay strings. */
export const ScheduledTaskWebhookDeliveryOutcome = forwardCompatibleLiteral([
  "accepted",
  "dispatch_failed",
  "duplicate",
  "coalesced",
  "rejected_signature",
  "disabled",
  "rate_limited",
  "expired",
  "filtered",
]);
export type ScheduledTaskWebhookDeliveryOutcome = z.infer<
  typeof ScheduledTaskWebhookDeliveryOutcome
>;

const deliverySummaryFields = {
  id: ScheduledTaskWebhookDeliveryId,
  taskId: ScheduledTaskId,
  receivedAt: IsoDateTime,
  method: TrimmedNonEmptyString,
  contentType: z.string().nullable(),
  bodyBytes: NonNegativeInt,
  outcome: ScheduledTaskWebhookDeliveryOutcome,
  signatureVerified: z.boolean(),
  pendingWindow: z.boolean().optional(),
  missingFields: z.array(z.string()),
  error: z.string().nullable(),
};

export const ScheduledTaskWebhookDeliverySummary = z.looseObject(deliverySummaryFields);
export type ScheduledTaskWebhookDeliverySummary = z.infer<
  typeof ScheduledTaskWebhookDeliverySummary
>;

/** One recorded request with its query, headers, (possibly truncated) body and rendered prompt. */
export const ScheduledTaskWebhookDelivery = z.looseObject({
  ...deliverySummaryFields,
  query: z.string(),
  headers: stringRecord(z.string()),
  body: z.string(),
  bodyTruncated: z.boolean(),
  renderedPrompt: z.string().nullable(),
});
export type ScheduledTaskWebhookDelivery = z.infer<typeof ScheduledTaskWebhookDelivery>;

export const ScheduledTaskListWebhookDeliveriesInput = z.looseObject({
  id: ScheduledTaskId,
  /** Without it the server leaves out rows whose outcome an older client cannot decode. */
  acceptAnyOutcome: z.boolean().optional(),
});
export const ScheduledTaskListWebhookDeliveriesResult = z.looseObject({
  deliveries: z.array(ScheduledTaskWebhookDeliverySummary),
});
export const ScheduledTaskGetWebhookDeliveryInput = z.looseObject({
  id: ScheduledTaskId,
  deliveryId: ScheduledTaskWebhookDeliveryId,
  acceptAnyOutcome: z.boolean().optional(),
});
export const ScheduledTaskGetWebhookDeliveryResult = z.looseObject({
  delivery: ScheduledTaskWebhookDelivery,
});
