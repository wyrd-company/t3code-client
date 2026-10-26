// ---
// relationships:
//   implements: library
// ---
/**
 * The `orchestration.subscribeCommandOutput` stream: the output of one
 * `command_execution` row, kept off the thread stream and never persisted as
 * events.
 */
import { z } from "zod";
import { ThreadId, TurnItemId, forwardCompatibleLiteral } from "../common.ts";

export const OrchestrationV2SubscribeCommandOutputInput = z.looseObject({
  threadId: ThreadId,
  itemId: TurnItemId,
});
export type OrchestrationV2SubscribeCommandOutputInput = z.infer<
  typeof OrchestrationV2SubscribeCommandOutputInput
>;

export const OrchestrationV2CommandOutputFrameKind = forwardCompatibleLiteral([
  "replace",
  "append",
]);
export type OrchestrationV2CommandOutputFrameKind = z.infer<
  typeof OrchestrationV2CommandOutputFrameKind
>;

/**
 * `replace` carries the whole bounded tail (the first frame, or after the
 * client fell behind); `append` extends it. `text` is terminal output with its
 * escapes, passed through unchanged. The stream ends after a frame with
 * `running: false`.
 */
export const OrchestrationV2CommandOutputFrame = z.looseObject({
  kind: OrchestrationV2CommandOutputFrameKind,
  text: z.string(),
  /** Earlier output was dropped to keep the tail bounded. */
  truncated: z.boolean(),
  running: z.boolean(),
});
export type OrchestrationV2CommandOutputFrame = z.infer<typeof OrchestrationV2CommandOutputFrame>;
