// ---
// relationships:
//   implements: library
// ---
/** User tags on a thread, matched by exact spelling and case after trimming. */
import { z } from "zod";
import { TrimmedNonEmptyString } from "../common.ts";

/** A tag a caller sends: one line, at most 64 characters after trimming. */
export const ThreadTag = TrimmedNonEmptyString.max(64).refine(
  (value) => !/\p{Cc}/u.test(value),
  "A thread tag must be a single line of text.",
);
export type ThreadTag = z.infer<typeof ThreadTag>;

/** Tags read back from a thread. Lenient, so a later tag rule never fails a whole thread. */
export const StoredThreadTags = z.array(z.string()).catch([]);
export type StoredThreadTags = z.infer<typeof StoredThreadTags>;
