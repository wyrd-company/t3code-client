// ---
// relationships:
//   implements: library
// ---
/** What a provider-native subagent's children did, from `orchestrationV2.ts`. */
import { z } from "zod";
import { NonNegativeInt, ThreadId, TrimmedNonEmptyString } from "../common.ts";

/** Names a provider-native subagent's child thread. */
export const OrchestrationV2GetNativeChildWorkInput = z.looseObject({
  threadId: ThreadId,
});
export type OrchestrationV2GetNativeChildWorkInput = z.infer<
  typeof OrchestrationV2GetNativeChildWorkInput
>;

export const OrchestrationV2NativeChildStep = z.looseObject({
  index: NonNegativeInt,
  type: z.string(),
  status: z.string().nullable(),
  text: z.string().nullable(),
  toolCalls: z.array(z.looseObject({ name: z.string(), input: z.string() })),
});
export type OrchestrationV2NativeChildStep = z.infer<typeof OrchestrationV2NativeChildStep>;

/** Read-only: a native child cannot take messages. */
export const OrchestrationV2NativeChildWork = z.looseObject({
  conversationId: TrimmedNonEmptyString,
  role: z.string(),
  prompt: z.string(),
  /** Null when the provider has no readable transcript for this child. */
  steps: z.array(OrchestrationV2NativeChildStep).nullable(),
  /** Earlier steps were left out to keep the read bounded. */
  truncated: z.boolean(),
});
export type OrchestrationV2NativeChildWork = z.infer<typeof OrchestrationV2NativeChildWork>;

/** Empty when the provider's records do not prove which children the subagent launched. */
export const OrchestrationV2GetNativeChildWorkResult = z.looseObject({
  children: z.array(OrchestrationV2NativeChildWork),
});
export type OrchestrationV2GetNativeChildWorkResult = z.infer<
  typeof OrchestrationV2GetNativeChildWorkResult
>;
