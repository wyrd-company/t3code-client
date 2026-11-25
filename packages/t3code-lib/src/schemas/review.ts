// ---
// relationships:
//   implements: library
// ---
/** Diff review reads, mirroring the contracts' `review.ts`. */
import { z } from "zod";
import {
  GitRefName,
  IsoDateTime,
  TrimmedNonEmptyString,
  forwardCompatibleLiteral,
} from "./common.ts";

const sourceKinds = ["working-tree", "branch-range", "commit"] as const;
export const ReviewDiffPreviewSourceKindInput = z.enum(sourceKinds);
export type ReviewDiffPreviewSourceKindInput = z.infer<typeof ReviewDiffPreviewSourceKindInput>;
export const ReviewDiffPreviewSourceKind = forwardCompatibleLiteral(sourceKinds);
export type ReviewDiffPreviewSourceKind = z.infer<typeof ReviewDiffPreviewSourceKind>;

export const ReviewDiffPreviewInput = z.looseObject({
  cwd: TrimmedNonEmptyString,
  baseRef: GitRefName.optional(),
  commitSha: TrimmedNonEmptyString.optional(),
  ignoreWhitespace: z.boolean().optional(),
  /** Read only this source kind. */
  sourceKind: z.enum(["working-tree", "branch-range"]).optional(),
  /** Leave untracked files out; the result is then `incomplete`. */
  trackedOnly: z.boolean().optional(),
  /** Return file stats without patches; `patchesDeferred` marks such a source. */
  metadataOnly: z.boolean().optional(),
  file: z
    .looseObject({
      path: z.string().min(1),
      previousPath: z.string().min(1).nullable(),
      sourceKind: ReviewDiffPreviewSourceKindInput,
    })
    .optional(),
});
export type ReviewDiffPreviewInput = z.infer<typeof ReviewDiffPreviewInput>;
export const ReviewBranchCommitsInput = z.looseObject({
  cwd: TrimmedNonEmptyString,
  baseRef: GitRefName.optional(),
});
export type ReviewBranchCommitsInput = z.infer<typeof ReviewBranchCommitsInput>;
export const ReviewBranchCommitsResult = z.looseObject({
  commits: z.array(
    z.looseObject({ sha: z.string(), subject: z.string(), committedAt: z.string() }),
  ),
  truncated: z.boolean(),
});
export type ReviewBranchCommitsResult = z.infer<typeof ReviewBranchCommitsResult>;
const ReviewDiffChangeType = z.enum(["change", "rename-pure", "rename-changed", "new", "deleted"]);

export const ReviewDiffFileStat = z.looseObject({
  path: z.string(),
  previousPath: z.string().nullable(),
  /** Older servers omit it. */
  changeType: ReviewDiffChangeType.optional(),
  additions: z.number(),
  deletions: z.number(),
});
export type ReviewDiffFileStat = z.infer<typeof ReviewDiffFileStat>;
export const ReviewDiffPreviewSource = z.looseObject({
  id: TrimmedNonEmptyString,
  kind: ReviewDiffPreviewSourceKind,
  title: TrimmedNonEmptyString,
  commitSubject: TrimmedNonEmptyString.optional(),
  baseRef: GitRefName.nullable(),
  headRef: GitRefName.nullable(),
  diff: z.string(),
  diffHash: TrimmedNonEmptyString,
  truncated: z.boolean(),
  patchesDeferred: z.boolean().optional(),
  files: z.array(ReviewDiffFileStat).optional(),
});
export type ReviewDiffPreviewSource = z.infer<typeof ReviewDiffPreviewSource>;
export const ReviewDiffPreviewResult = z.looseObject({
  cwd: TrimmedNonEmptyString,
  generatedAt: IsoDateTime,
  sources: z.array(ReviewDiffPreviewSource),
  /** Set when untracked files were left out (`trackedOnly`). */
  incomplete: z.boolean().optional(),
});
export type ReviewDiffPreviewResult = z.infer<typeof ReviewDiffPreviewResult>;
export const ReviewDiffFileContentsInput = z.looseObject({
  cwd: TrimmedNonEmptyString,
  sourceKind: ReviewDiffPreviewSourceKindInput,
  changeType: ReviewDiffChangeType,
  baseRef: GitRefName.nullable(),
  headRef: GitRefName.nullable(),
  oldPath: z.string().min(1),
  newPath: z.string().min(1),
});
export type ReviewDiffFileContentsInput = z.infer<typeof ReviewDiffFileContentsInput>;
export const ReviewDiffFileContentsResult = z.looseObject({
  oldContents: z.string(),
  newContents: z.string(),
});
export type ReviewDiffFileContentsResult = z.infer<typeof ReviewDiffFileContentsResult>;
