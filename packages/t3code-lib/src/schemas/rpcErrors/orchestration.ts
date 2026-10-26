/**
 * Tagged failures of the orchestration RPC methods, mirroring the contracts'
 * `orchestrationDispatch.ts`, `orchestrationV2.ts`, `checkpointDiff.ts`, and
 * `threadSearch.ts`.
 */
import { z } from "zod";
import { CommandId, NodeId, ProjectId, ThreadId, forwardCompatibleLiteral } from "../common.ts";
import { Defect, messageAndCause, taggedError } from "./shared.ts";

/** Raised by `projects.ensureScratch` and `projects.createNew`. */
export const OrchestrationDispatchCommandError = taggedError("OrchestrationDispatchCommandError", {
  ...messageAndCause,
  bootstrapThreadDisposition: forwardCompatibleLiteral(["deleted", "not-created"]).optional(),
});
/** Raised by `orchestration.dispatchCommand`; `detail` is the user-facing cause when known. */
export const OrchestrationV2DispatchCommandError = taggedError(
  "OrchestrationV2DispatchCommandError",
  {
    commandId: CommandId,
    commandType: z.string(),
    message: z.string(),
    detail: z.string().optional(),
    cause: Defect.optional(),
  },
);
export const OrchestrationV2GetThreadProjectionError = taggedError(
  "OrchestrationV2GetThreadProjectionError",
  { threadId: ThreadId, ...messageAndCause },
);
export const OrchestrationV2GetShellSnapshotError = taggedError(
  "OrchestrationV2GetShellSnapshotError",
  messageAndCause,
);
export const OrchestrationV2ThreadLaunchError = taggedError("OrchestrationV2ThreadLaunchError", {
  commandId: CommandId,
  projectId: ProjectId,
  ...messageAndCause,
});
export const OrchestrationGetTurnDiffError = taggedError(
  "OrchestrationGetTurnDiffError",
  messageAndCause,
);
export const OrchestrationGetFullThreadDiffError = taggedError(
  "OrchestrationGetFullThreadDiffError",
  messageAndCause,
);
export const OrchestrationSearchThreadsError = taggedError(
  "OrchestrationSearchThreadsError",
  messageAndCause,
);
export const OrchestrationGetWorkflowScriptError = taggedError(
  "OrchestrationGetWorkflowScriptError",
  {
    reason: forwardCompatibleLiteral([
      "invalid-path",
      "root-unavailable",
      "not-found",
      "outside-root",
      "not-js",
      "not-regular-file",
      "changed-during-read",
      "read-failed",
    ]),
    scriptPath: z.string(),
    cause: Defect.optional(),
  },
);
export const OrchestrationV2StopWorkflowError = taggedError("OrchestrationV2StopWorkflowError", {
  threadId: ThreadId,
  subagentId: NodeId,
  reason: forwardCompatibleLiteral(["not-running", "unsupported", "unavailable", "stop-failed"]),
  cause: Defect.optional(),
});
/** Raised by `orchestration.subscribeCommandOutput`, for example when the row is not a command. */
export const OrchestrationV2CommandOutputError = taggedError("OrchestrationV2CommandOutputError", {
  threadId: ThreadId,
  message: z.string(),
  cause: Defect.optional(),
});
export const OrchestrationV2SearchThreadError = taggedError("OrchestrationV2SearchThreadError", {
  cause: Defect,
});
