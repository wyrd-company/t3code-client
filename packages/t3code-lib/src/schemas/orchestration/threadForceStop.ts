// ---
// relationships:
//   implements: library
// ---
/** Input and result of `orchestration.forceStopThread`. */
import { z } from "zod";
import { RunId, ThreadId, forwardCompatibleLiteral } from "../common.ts";

export const OrchestrationV2ForceStopThreadInput = z.looseObject({
  threadId: ThreadId,
  /** The run that ignored Stop; the server refuses once a newer run has started. */
  runId: RunId.optional(),
});
export type OrchestrationV2ForceStopThreadInput = z.infer<
  typeof OrchestrationV2ForceStopThreadInput
>;

export const OrchestrationV2ForceStopThreadResult = z.looseObject({
  /**
   * `killed`: the thread's own agent processes were killed. `released`: its provider session was
   * torn down. `releasing`: that teardown continues on the server. `shared`: the agent process also
   * works for `sharedWithThreadIds`, so only this thread's turn was ended.
   */
  outcome: forwardCompatibleLiteral(["killed", "released", "releasing", "shared"]),
  sharedWithThreadIds: z.array(ThreadId),
});
export type OrchestrationV2ForceStopThreadResult = z.infer<
  typeof OrchestrationV2ForceStopThreadResult
>;
