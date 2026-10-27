/** Tagged failures of the scheduler and usage RPC methods, mirroring `scheduledTask.ts` and `usage.ts`. */
import { z } from "zod";
import { ScheduledTaskId, TrimmedNonEmptyString, forwardCompatibleLiteral } from "../common.ts";
import { Defect, taggedError } from "./shared.ts";

export const ScheduledTaskError = taggedError("ScheduledTaskError", {
  message: z.string(),
  taskId: ScheduledTaskId.optional(),
  cause: Defect.optional(),
});

export const UsageReadErrorReason = forwardCompatibleLiteral(["scanFailed", "invalidWindow"]);
/** Its class derives `message` from `reason` and `detail`, so only those arrive. */
export const UsageReadError = taggedError("UsageReadError", {
  reason: UsageReadErrorReason,
  detail: TrimmedNonEmptyString,
  cause: Defect.optional(),
});
