/** Tagged failures of the scheduler and usage RPC methods, mirroring `scheduledTask.ts` and `usage.ts`. */
import { z } from "zod";
import { ScheduledTaskId, TrimmedNonEmptyString, forwardCompatibleLiteral } from "../common.ts";
import { Defect, taggedError } from "./shared.ts";

export const ScheduledTaskError = taggedError("ScheduledTaskError", {
  message: z.string(),
  taskId: ScheduledTaskId.optional(),
  cause: Defect.optional(),
});

/** A workflow service failure, its message built from the service's own attributes. */
export const WorkflowRequestError = taggedError("WorkflowRequestError", { message: z.string() });

export const UsageReadErrorReason = forwardCompatibleLiteral(["scanFailed", "invalidWindow"]);
/** Its class derives `message` from `reason` and `detail`, so only those arrive. */
export const UsageReadError = taggedError("UsageReadError", {
  reason: UsageReadErrorReason,
  detail: TrimmedNonEmptyString,
  cause: Defect.optional(),
});
