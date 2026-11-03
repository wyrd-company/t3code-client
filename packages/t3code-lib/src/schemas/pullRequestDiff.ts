// ---
// relationships:
//   implements: library
// ---
/**
 * Mirrors the diff, viewed file and review guide results of
 * `packages/contracts/src/pullRequest.ts` and `pullRequestReviewGuide.ts`.
 * A result stays open, so a newer server's values decode.
 */
import { z } from "zod";
import {
  IsoDateTime,
  NonNegativeInt,
  PositiveInt,
  TrimmedNonEmptyString,
  forwardCompatibleLiteral,
  taggedUnionWithUnknown,
} from "./common.ts";
import { ModelSelection } from "./orchestration/model.ts";

export const PullRequestDiffResult = z.looseObject({
  patch: z.string(),
  /** Content is left out of this slice. `nextCursor` tells separately of more slices. */
  truncated: z.boolean(),
  nextCursor: TrimmedNonEmptyString.nullable(),
  omittedFileStats: z
    .array(
      z.looseObject({
        path: TrimmedNonEmptyString,
        additions: z.number(),
        deletions: z.number(),
      }),
    )
    .optional(),
});
export type PullRequestDiffResult = z.infer<typeof PullRequestDiffResult>;

export const PullRequestDiffFileContentsResult = z.looseObject({
  oldContents: z.string(),
  newContents: z.string(),
});
export type PullRequestDiffFileContentsResult = z.infer<typeof PullRequestDiffFileContentsResult>;

export const PullRequestFilesViewedResult = z.looseObject({
  /** Only the files with a state from the host. A file that is not in the list is unviewed. */
  files: z.array(
    z.looseObject({
      path: z.string().min(1).max(4096),
      state: forwardCompatibleLiteral(["unviewed", "viewed", "dismissed"]),
    }),
  ),
  truncated: z.boolean(),
});
export type PullRequestFilesViewedResult = z.infer<typeof PullRequestFilesViewedResult>;

const LineCount = z.looseObject({ additions: NonNegativeInt, deletions: NonNegativeInt });

/**
 * A change's line counts by the kind of file, judged from the paths. `null` when the host
 * gives no counts for each file, or has more files than one read covers.
 */
export const PullRequestChangeBreakdown = z
  .looseObject({
    code: LineCount,
    tests: LineCount,
    mocks: LineCount,
    generated: LineCount,
    /** An older server sends no `docs`, and counts those lines in `code`. */
    docs: LineCount.default({ additions: 0, deletions: 0 }),
  })
  .nullable();
export type PullRequestChangeBreakdown = z.infer<typeof PullRequestChangeBreakdown>;

export const PullRequestReviewGuideStop = z.looseObject({
  title: TrimmedNonEmptyString,
  summary: z.string(),
  attention: z
    .looseObject({
      kind: forwardCompatibleLiteral(["tradeoff", "contract", "product", "risk", "accessibility"]),
      note: TrimmedNonEmptyString,
    })
    .nullable(),
  excerpts: z.array(
    z.looseObject({
      path: TrimmedNonEmptyString,
      side: forwardCompatibleLiteral(["new", "old"]),
      start: PositiveInt,
      end: PositiveInt,
      caption: z.string(),
    }),
  ),
  files: z.array(z.looseObject({ path: TrimmedNonEmptyString, note: z.string().optional() })),
  notes: z.array(
    z.looseObject({
      path: TrimmedNonEmptyString,
      line: PositiveInt,
      title: TrimmedNonEmptyString,
      body: z.string(),
    }),
  ),
  questions: z.array(TrimmedNonEmptyString),
});
export type PullRequestReviewGuideStop = z.infer<typeof PullRequestReviewGuideStop>;

export const PullRequestReviewGuide = z.looseObject({
  headSha: TrimmedNonEmptyString,
  generatedAt: IsoDateTime,
  modelSelection: ModelSelection,
  stops: z.array(PullRequestReviewGuideStop),
});
export type PullRequestReviewGuide = z.infer<typeof PullRequestReviewGuide>;

export const PullRequestReviewGuideRun = taggedUnionWithUnknown("_tag", [
  z.looseObject({
    _tag: z.literal("Running"),
    headSha: TrimmedNonEmptyString,
    startedAt: IsoDateTime,
  }),
  z.looseObject({
    _tag: z.literal("Failed"),
    headSha: TrimmedNonEmptyString,
    failedAt: IsoDateTime,
    detail: TrimmedNonEmptyString,
  }),
]);
export type PullRequestReviewGuideRun = z.infer<typeof PullRequestReviewGuideRun>;

/** `guide.headSha` can be older than `currentHeadSha`: the stored guide is not removed. */
export const PullRequestReviewGuideResult = z.looseObject({
  guide: PullRequestReviewGuide.nullable(),
  run: PullRequestReviewGuideRun.nullable(),
  currentHeadSha: TrimmedNonEmptyString.nullable(),
});
export type PullRequestReviewGuideResult = z.infer<typeof PullRequestReviewGuideResult>;
