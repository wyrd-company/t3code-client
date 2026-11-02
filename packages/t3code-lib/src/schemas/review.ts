// ---
// relationships:
//   implements: library
// ---
/** Diff review reads, mirroring the contracts' `review.ts`. */
import { z } from "zod";
import { IsoDateTime, TrimmedNonEmptyString, forwardCompatibleLiteral } from "./common.ts";

const sourceKinds = ["working-tree", "branch-range", "commit"] as const;
export const ReviewDiffPreviewSourceKindInput = z.enum(sourceKinds);
export type ReviewDiffPreviewSourceKindInput = z.infer<typeof ReviewDiffPreviewSourceKindInput>;
export const ReviewDiffPreviewSourceKind = forwardCompatibleLiteral(sourceKinds);
export type ReviewDiffPreviewSourceKind = z.infer<typeof ReviewDiffPreviewSourceKind>;

export const ReviewDiffPreviewInput = z.looseObject({
  cwd: TrimmedNonEmptyString,
  baseRef: TrimmedNonEmptyString.optional(),
  commitSha: TrimmedNonEmptyString.optional(),
  ignoreWhitespace: z.boolean().optional(),
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
  baseRef: TrimmedNonEmptyString.optional(),
});
export type ReviewBranchCommitsInput = z.infer<typeof ReviewBranchCommitsInput>;
export const ReviewBranchCommitsResult = z.looseObject({
  commits: z.array(
    z.looseObject({ sha: z.string(), subject: z.string(), committedAt: z.string() }),
  ),
  truncated: z.boolean(),
});
export type ReviewBranchCommitsResult = z.infer<typeof ReviewBranchCommitsResult>;
export const ReviewDiffFileStat = z.looseObject({
  path: z.string(),
  previousPath: z.string().nullable(),
  additions: z.number(),
  deletions: z.number(),
});
export type ReviewDiffFileStat = z.infer<typeof ReviewDiffFileStat>;
export const ReviewDiffPreviewSource = z.looseObject({
  id: TrimmedNonEmptyString,
  kind: ReviewDiffPreviewSourceKind,
  title: TrimmedNonEmptyString,
  commitSubject: TrimmedNonEmptyString.optional(),
  baseRef: TrimmedNonEmptyString.nullable(),
  headRef: TrimmedNonEmptyString.nullable(),
  diff: z.string(),
  diffHash: TrimmedNonEmptyString,
  truncated: z.boolean(),
  files: z.array(ReviewDiffFileStat).optional(),
});
export type ReviewDiffPreviewSource = z.infer<typeof ReviewDiffPreviewSource>;
export const ReviewDiffPreviewResult = z.looseObject({
  cwd: TrimmedNonEmptyString,
  generatedAt: IsoDateTime,
  sources: z.array(ReviewDiffPreviewSource),
});
export type ReviewDiffPreviewResult = z.infer<typeof ReviewDiffPreviewResult>;
export const ReviewDiffFileContentsInput = z.looseObject({
  cwd: TrimmedNonEmptyString,
  sourceKind: ReviewDiffPreviewSourceKindInput,
  changeType: z.enum(["change", "rename-pure", "rename-changed", "new", "deleted"]),
  baseRef: TrimmedNonEmptyString.nullable(),
  headRef: TrimmedNonEmptyString.nullable(),
  oldPath: TrimmedNonEmptyString,
  newPath: TrimmedNonEmptyString,
});
export type ReviewDiffFileContentsInput = z.infer<typeof ReviewDiffFileContentsInput>;
export const ReviewDiffFileContentsResult = z.looseObject({
  oldContents: z.string(),
  newContents: z.string(),
});
export type ReviewDiffFileContentsResult = z.infer<typeof ReviewDiffFileContentsResult>;
