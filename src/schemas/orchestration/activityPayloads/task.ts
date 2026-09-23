/**
 * Payloads of the `task.*` activities ingestion builds from provider task
 * lifecycle events. Every row repeats the task's agent linkage so a client
 * can rebuild an agent after its start row ages out.
 */
import { z } from "zod";
import { IsoDateTime, TrimmedNonEmptyString, forwardCompatibleLiteral } from "../../common.ts";
import {
  RuntimeTaskId,
  RuntimeTaskStatus,
  RuntimeTaskUsage,
  taskAgentLinkageFields,
} from "./providerRuntime.ts";

export const TaskStartedActivityPayload = z.looseObject({
  taskId: RuntimeTaskId,
  detail: TrimmedNonEmptyString.optional(),
  ...taskAgentLinkageFields,
});
export type TaskStartedActivityPayload = z.infer<typeof TaskStartedActivityPayload>;

/** The latest progress of a task. The server keeps one such row per task. */
export const TaskProgressStateActivityPayload = z.looseObject({
  taskId: RuntimeTaskId,
  ...taskAgentLinkageFields,
  // Empty when the provider sent neither a summary nor a description.
  detail: z.string(),
  summary: TrimmedNonEmptyString.optional(),
  lastToolName: TrimmedNonEmptyString.optional(),
  status: RuntimeTaskStatus.optional(),
  error: TrimmedNonEmptyString.optional(),
  // The provider's raw usage report; the contracts leave it opaque.
  usage: z.unknown().optional(),
});
export type TaskProgressStateActivityPayload = z.infer<typeof TaskProgressStateActivityPayload>;

/** The latest token usage of a task. The server keeps one such row per task. */
export const TaskUsageSnapshotActivityPayload = z.looseObject({
  taskId: RuntimeTaskId,
  ...taskAgentLinkageFields,
  usageSnapshot: z.literal(true),
  typedUsage: RuntimeTaskUsage,
});
export type TaskUsageSnapshotActivityPayload = z.infer<typeof TaskUsageSnapshotActivityPayload>;

/** A `task.progress` row: a usage snapshot when `usageSnapshot` is set, otherwise progress state. */
export const TaskProgressActivityPayload = z.union([
  TaskUsageSnapshotActivityPayload,
  TaskProgressStateActivityPayload,
]);
export type TaskProgressActivityPayload = z.infer<typeof TaskProgressActivityPayload>;

export const TaskUpdatedActivityPayload = z.looseObject({
  taskId: RuntimeTaskId,
  detail: TrimmedNonEmptyString.optional(),
  endedAt: IsoDateTime.optional(),
  isBackgrounded: z.boolean().optional(),
  status: RuntimeTaskStatus.optional(),
  error: TrimmedNonEmptyString.optional(),
  ...taskAgentLinkageFields,
});
export type TaskUpdatedActivityPayload = z.infer<typeof TaskUpdatedActivityPayload>;

export const TaskCompletedStatus = forwardCompatibleLiteral(["completed", "failed", "stopped"]);
export type TaskCompletedStatus = z.infer<typeof TaskCompletedStatus>;

export const TaskCompletedActivityPayload = z.looseObject({
  taskId: RuntimeTaskId,
  status: TaskCompletedStatus,
  ...taskAgentLinkageFields,
  // `summary` and `detail` are both present or both absent.
  summary: TrimmedNonEmptyString.optional(),
  detail: TrimmedNonEmptyString.optional(),
  // The provider's raw usage report; the contracts leave it opaque.
  usage: z.unknown().optional(),
  typedUsage: RuntimeTaskUsage.optional(),
});
export type TaskCompletedActivityPayload = z.infer<typeof TaskCompletedActivityPayload>;
