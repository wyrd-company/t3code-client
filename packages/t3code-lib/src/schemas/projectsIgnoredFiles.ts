// ---
// relationships:
//   implements: library
// ---
import { z } from "zod";
import { NonNegativeInt, TrimmedNonEmptyString, forwardCompatibleArray } from "./common.ts";

// project.ts: untracked files git ignores. The server leaves out wholly
// ignored folders such as `node_modules`, so the list stays small.

export const ProjectListIgnoredFilesInput = z.looseObject({
  cwd: TrimmedNonEmptyString,
});
export type ProjectListIgnoredFilesInput = z.infer<typeof ProjectListIgnoredFilesInput>;

export const ProjectIgnoredFile = z.looseObject({
  path: TrimmedNonEmptyString,
  byteLength: NonNegativeInt,
});
export type ProjectIgnoredFile = z.infer<typeof ProjectIgnoredFile>;

/** A malformed file entry is left out; the other entries remain. */
export const ProjectListIgnoredFilesResult = z.looseObject({
  files: forwardCompatibleArray(ProjectIgnoredFile),
  truncated: z.boolean(),
});
export type ProjectListIgnoredFilesResult = z.infer<typeof ProjectListIgnoredFilesResult>;
