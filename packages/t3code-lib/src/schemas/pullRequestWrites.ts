// ---
// relationships:
//   implements: library
// ---
/**
 * The inputs of the pull request write methods, with the closed values and bounds
 * of `packages/contracts/src/pullRequest.ts`. A closed value here has its own form,
 * because the same name in a result stays open for a newer server. Unknown keys pass.
 */
import { z } from "zod";
import { PositiveInt, TrimmedNonEmptyString } from "./common.ts";
import { PullRequestRef } from "./pullRequestInputs.ts";

/** Whitespace stays, since it can be part of Markdown or a file name. */
const CommentBody = z.string().min(1).max(65_536);
const ReviewBody = z.string().max(65_536);
const FilePath = z.string().min(1).max(4096);

const refFields = PullRequestRef.shape;

export const PullRequestInvalidateInput = z.looseObject({
  /** Without it, every read is dropped. */
  reference: PullRequestRef.optional(),
  filesViewedOnly: z.boolean().optional(),
});
export type PullRequestInvalidateInput = z.infer<typeof PullRequestInvalidateInput>;

export const PullRequestReportStateInput = z.looseObject({
  reference: PullRequestRef,
  state: z.enum(["open", "closed", "merged"]),
  isDraft: z.boolean().optional(),
});
export type PullRequestReportStateInput = z.infer<typeof PullRequestReportStateInput>;

export const PullRequestSetFilesViewedInput = z.looseObject({
  ...refFields,
  files: z.array(z.looseObject({ path: FilePath, viewed: z.boolean() })).max(500),
});
export type PullRequestSetFilesViewedInput = z.infer<typeof PullRequestSetFilesViewedInput>;

export const PullRequestStackHead = z.looseObject({
  number: PositiveInt,
  headSha: TrimmedNonEmptyString,
});
export type PullRequestStackHead = z.infer<typeof PullRequestStackHead>;

export const PullRequestActionInput = z.looseObject({
  ...refFields,
  action: z.enum([
    "merge",
    "ready",
    "draft",
    "close",
    "reopen",
    "delete-branch",
    "update-branch",
    "enable-auto-merge",
    "disable-auto-merge",
    "revert",
    "approve-workflows",
  ]),
  mergeMethod: z.enum(["merge", "squash", "rebase"]).optional(),
  updateMethod: z.enum(["merge", "rebase"]).optional(),
  /** Acts on a native stack. Send it only when `pullRequestStackActions` is on. */
  stackNumber: PositiveInt.optional(),
  expectedStackHeads: z.array(PullRequestStackHead).optional(),
});
export type PullRequestActionInput = z.infer<typeof PullRequestActionInput>;

export const PullRequestCommentInput = z.looseObject({ ...refFields, body: CommentBody });
export type PullRequestCommentInput = z.infer<typeof PullRequestCommentInput>;

export const PullRequestUpdateInput = z.looseObject({
  ...refFields,
  title: TrimmedNonEmptyString.max(1024).optional(),
  body: ReviewBody.optional(),
  maintainerCanModify: z.boolean().optional(),
});
export type PullRequestUpdateInput = z.infer<typeof PullRequestUpdateInput>;

export const PullRequestCommentUpdateInput = z.looseObject({
  ...refFields,
  commentId: TrimmedNonEmptyString,
  /** Selects the host's endpoint. */
  kind: z.enum(["issue-comment", "review-comment"]),
  body: CommentBody,
});
export type PullRequestCommentUpdateInput = z.infer<typeof PullRequestCommentUpdateInput>;

export const PullRequestReviewPosition = z.discriminatedUnion("kind", [
  z.looseObject({ kind: z.literal("added"), newLine: PositiveInt }),
  z.looseObject({ kind: z.literal("deleted"), oldLine: PositiveInt }),
  z.looseObject({
    kind: z.literal("context"),
    oldLine: PositiveInt,
    newLine: PositiveInt,
    side: z.enum(["left", "right"]),
  }),
]);
export type PullRequestReviewPosition = z.infer<typeof PullRequestReviewPosition>;

export const PullRequestReviewCommentDraft = z.looseObject({
  path: TrimmedNonEmptyString,
  /** The name of a renamed file before the change, for a host that needs both. */
  oldPath: TrimmedNonEmptyString.optional(),
  position: PullRequestReviewPosition,
  /** The first line of a range that ends at `position`. Send it only with `review.rangeComment`. */
  startPosition: PullRequestReviewPosition.optional(),
  body: CommentBody,
});
export type PullRequestReviewCommentDraft = z.infer<typeof PullRequestReviewCommentDraft>;

export const PullRequestSubmitReviewInput = z.looseObject({
  ...refFields,
  verdict: z.enum(["comment", "approve", "request-changes"]),
  body: ReviewBody,
  comments: z.array(PullRequestReviewCommentDraft),
});
export type PullRequestSubmitReviewInput = z.infer<typeof PullRequestSubmitReviewInput>;

export const PullRequestThreadReplyInput = z.looseObject({
  ...refFields,
  threadId: TrimmedNonEmptyString,
  body: CommentBody,
});
export type PullRequestThreadReplyInput = z.infer<typeof PullRequestThreadReplyInput>;

export const PullRequestThreadResolutionInput = z.looseObject({
  ...refFields,
  threadId: TrimmedNonEmptyString,
  resolved: z.boolean(),
});
export type PullRequestThreadResolutionInput = z.infer<typeof PullRequestThreadResolutionInput>;

export const PullRequestReactionInput = z.looseObject({
  ...refFields,
  /** The comment to react to. Without it, the reaction is on the pull request. */
  subjectId: TrimmedNonEmptyString.optional(),
  content: z.enum([
    "thumbs-up",
    "thumbs-down",
    "laugh",
    "hooray",
    "confused",
    "heart",
    "rocket",
    "eyes",
  ]),
  reacted: z.boolean(),
});
export type PullRequestReactionInput = z.infer<typeof PullRequestReactionInput>;

export const PullRequestReviewerRequestInput = z.looseObject({
  ...refFields,
  reviewers: z
    .array(z.looseObject({ id: TrimmedNonEmptyString, kind: z.enum(["user", "team"]) }))
    .min(1)
    .max(25),
  requested: z.boolean(),
});
export type PullRequestReviewerRequestInput = z.infer<typeof PullRequestReviewerRequestInput>;

export const PullRequestLabelChangeInput = z.looseObject({
  ...refFields,
  labels: z.array(TrimmedNonEmptyString).min(1).max(25),
  applied: z.boolean(),
});
export type PullRequestLabelChangeInput = z.infer<typeof PullRequestLabelChangeInput>;
