// ---
// relationships:
//   implements: design
// ---
/** Find within one thread: `orchestration.searchThread` and its streaming form. */
import { z } from "zod";
import { NonNegativeInt, RunId, ThreadId, TrimmedNonEmptyString } from "../common.ts";

export const OrchestrationV2SearchThreadInput = z.looseObject({
  threadId: ThreadId,
  /** Skill labels the client displays, so a query matches custom display names. */
  skills: z
    .array(
      z.looseObject({
        name: z.string().max(200),
        displayName: z.string().max(200).optional(),
      }),
    )
    .max(1_000)
    .optional(),
  query: TrimmedNonEmptyString.max(200),
  index: NonNegativeInt.optional(),
  /** Select relative to `start`, so updates before it do not shift navigation. */
  offset: z.number().int().optional(),
  start: z.looseObject({ entryId: TrimmedNonEmptyString, occurrence: NonNegativeInt }).optional(),
});
export type OrchestrationV2SearchThreadInput = z.infer<typeof OrchestrationV2SearchThreadInput>;

export const OrchestrationV2ThreadFindMatch = z.looseObject({
  entryId: TrimmedNonEmptyString,
  runId: RunId.nullable(),
  occurrence: NonNegativeInt,
});
export type OrchestrationV2ThreadFindMatch = z.infer<typeof OrchestrationV2ThreadFindMatch>;

export const OrchestrationV2SearchThreadResult = z.looseObject({
  /** Absent from older servers. An early streamed match has no final ordinal or total yet. */
  complete: z.boolean().optional(),
  snapshotSequence: NonNegativeInt,
  totalMatches: NonNegativeInt,
  activeIndex: NonNegativeInt,
  match: OrchestrationV2ThreadFindMatch.nullable(),
  /** Counts and identities around the selection, to step without another round trip. */
  navigation: z
    .array(
      z.looseObject({
        entryId: TrimmedNonEmptyString,
        runId: RunId.nullable(),
        startIndex: NonNegativeInt,
        count: NonNegativeInt,
      }),
    )
    .optional(),
});
export type OrchestrationV2SearchThreadResult = z.infer<typeof OrchestrationV2SearchThreadResult>;
