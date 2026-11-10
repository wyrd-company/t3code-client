// ---
// relationships:
//   implements: library
// ---
/** Reads of thread titles, thread link metadata and the predicted next prompt. */
import { z } from "zod";
import { ProjectId, RunId, ThreadId } from "../common.ts";

export const OrchestrationV2GetThreadTitlesInput = z.looseObject({
  threadIds: z.array(ThreadId),
});
export type OrchestrationV2GetThreadTitlesInput = z.infer<
  typeof OrchestrationV2GetThreadTitlesInput
>;

/** Titles of the requested threads that exist, archived ones included. Deleted and unknown ids are absent. */
export const OrchestrationV2ThreadTitles = z.record(ThreadId, z.string());
export type OrchestrationV2ThreadTitles = z.infer<typeof OrchestrationV2ThreadTitles>;

export const OrchestrationV2ThreadLinkMetadata = z.looseObject({
  title: z.string(),
  projectId: ProjectId.nullable(),
});
export type OrchestrationV2ThreadLinkMetadata = z.infer<typeof OrchestrationV2ThreadLinkMetadata>;

/**
 * Link metadata of the requested threads that exist, keyed by thread id. Send only to
 * servers that advertise `threadLinkMetadata`.
 */
export const OrchestrationV2ThreadLinkMetadataMap = z.record(
  ThreadId,
  OrchestrationV2ThreadLinkMetadata,
);
export type OrchestrationV2ThreadLinkMetadataMap = z.infer<
  typeof OrchestrationV2ThreadLinkMetadataMap
>;

export const OrchestrationV2SubscribePromptSuggestionInput = z.looseObject({
  threadId: ThreadId,
});
export type OrchestrationV2SubscribePromptSuggestionInput = z.infer<
  typeof OrchestrationV2SubscribePromptSuggestionInput
>;

/** Unpersisted predicted next prompt for the run that produced it; null when there is none. */
export const OrchestrationV2PromptSuggestion = z
  .looseObject({ runId: RunId, text: z.string() })
  .nullable();
export type OrchestrationV2PromptSuggestion = z.infer<typeof OrchestrationV2PromptSuggestion>;
