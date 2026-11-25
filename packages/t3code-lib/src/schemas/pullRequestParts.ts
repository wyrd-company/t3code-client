// ---
// relationships:
//   implements: library
// ---
/**
 * Mirrors the parts of `packages/contracts/src/pullRequest.ts` that several pull
 * request results share: people, labels, checks, comments, review threads and
 * commits. A result stays open, so a newer server's values decode.
 */
import { z } from "zod";
import {
  GitRefName,
  IsoDateTime,
  NonNegativeInt,
  PositiveInt,
  TrimmedNonEmptyString,
  forwardCompatibleLiteral,
} from "./common.ts";
import { PullRequestActor } from "./orchestration/pullRequest.ts";
import { PULL_REQUEST_ACTIONS, PULL_REQUEST_REACTIONS } from "./pullRequestValues.ts";

export {
  PullRequestActor,
  PullRequestChecksState,
  PullRequestMergeability,
  PullRequestReviewDecision,
  PullRequestState,
} from "./orchestration/pullRequest.ts";

/** `fast-forward` refuses unless the head contains the base, where `rebase` rewrites the branch. */
export const PullRequestMergeMethod = forwardCompatibleLiteral([
  "merge",
  "squash",
  "rebase",
  "fast-forward",
]);
export type PullRequestMergeMethod = z.infer<typeof PullRequestMergeMethod>;

/** `#` references issues and GitHub pull requests. `!` references GitLab merge requests. */
export const PullRequestReferenceSigil = forwardCompatibleLiteral(["#", "!"]);
export type PullRequestReferenceSigil = z.infer<typeof PullRequestReferenceSigil>;

export const PullRequestAction = forwardCompatibleLiteral(PULL_REQUEST_ACTIONS);
export type PullRequestAction = z.infer<typeof PullRequestAction>;

export const PullRequestUpdateMethod = forwardCompatibleLiteral(["merge", "rebase"]);
export type PullRequestUpdateMethod = z.infer<typeof PullRequestUpdateMethod>;

export const PullRequestReviewVerdict = forwardCompatibleLiteral([
  "comment",
  "approve",
  "request-changes",
]);
export type PullRequestReviewVerdict = z.infer<typeof PullRequestReviewVerdict>;

export const PullRequestLabel = z.looseObject({
  name: TrimmedNonEmptyString,
  color: z.string().nullable(),
  description: z.string().nullable().optional(),
});
export type PullRequestLabel = z.infer<typeof PullRequestLabel>;

export const PullRequestCheck = z.looseObject({
  name: TrimmedNonEmptyString,
  status: forwardCompatibleLiteral([
    "pending",
    "action-required",
    "success",
    "failure",
    "skipped",
    "neutral",
    "cancelled",
  ]),
  description: z.string().nullable(),
  url: z.string().nullable(),
  required: z.boolean().optional(),
  /**
   * Not a check: it stands for ones the host could not list, such as workflow runs awaiting
   * approval when that read fails, so nothing waits on it or counts it as passing.
   */
  placeholder: z.boolean().optional(),
});
export type PullRequestCheck = z.infer<typeof PullRequestCheck>;

export const PullRequestReaction = z.looseObject({
  content: forwardCompatibleLiteral(PULL_REQUEST_REACTIONS),
  count: PositiveInt,
  /** Excludes the viewer's login when `viewerHasReacted`. `count` still includes the viewer. */
  actors: z.array(TrimmedNonEmptyString),
  viewerHasReacted: z.boolean(),
});
export type PullRequestReaction = z.infer<typeof PullRequestReaction>;

export const PullRequestComment = z.looseObject({
  id: TrimmedNonEmptyString,
  kind: forwardCompatibleLiteral(["issue-comment", "review-comment", "review"]),
  author: PullRequestActor.nullable(),
  body: z.string(),
  createdAt: IsoDateTime,
  editedAt: IsoDateTime.nullable().optional(),
  url: z.string().nullable(),
  path: z.string().nullable(),
  reviewState: z.string().nullable(),
  reactions: z.array(PullRequestReaction).optional(),
  canEdit: z.boolean().optional(),
});
export type PullRequestComment = z.infer<typeof PullRequestComment>;

export const PullRequestThreadComment = z.looseObject({
  id: TrimmedNonEmptyString,
  author: PullRequestActor.nullable(),
  body: z.string(),
  createdAt: IsoDateTime,
  editedAt: IsoDateTime.nullable().optional(),
  url: z.string().nullable(),
  /** The review that posted the comment, so a link to a review with no text finds its comments. */
  reviewUrl: z.string().nullable().optional(),
  reactions: z.array(PullRequestReaction).optional(),
  canEdit: z.boolean().optional(),
});
export type PullRequestThreadComment = z.infer<typeof PullRequestThreadComment>;

export const PullRequestReviewThread = z.looseObject({
  id: TrimmedNonEmptyString,
  path: TrimmedNonEmptyString,
  line: PositiveInt.nullable(),
  side: forwardCompatibleLiteral(["left", "right"]),
  isResolved: z.boolean(),
  isOutdated: z.boolean(),
  comments: z.array(PullRequestThreadComment),
  commentCount: NonNegativeInt.optional(),
  nextCommentsCursor: TrimmedNonEmptyString.optional(),
  /** Can only narrow the repository-wide permission. Absent when the host does not report it. */
  canResolve: z.boolean().optional(),
});
export type PullRequestReviewThread = z.infer<typeof PullRequestReviewThread>;

/** A thread on the change request as a whole, such as a GitLab overview thread. */
export const PullRequestOverviewThread = PullRequestReviewThread.extend({
  path: z.null(),
  line: z.null(),
});
export type PullRequestOverviewThread = z.infer<typeof PullRequestOverviewThread>;

/** The host's merge queue letting go of a pull request without merging it. */
/** Who can read a pull request on a host that can hide one in a public repository. */
export const PullRequestVisibility = forwardCompatibleLiteral(["public", "private"]);
export type PullRequestVisibility = z.infer<typeof PullRequestVisibility>;

export const PullRequestMergeQueueRemoval = z.looseObject({
  id: TrimmedNonEmptyString,
  removedAt: IsoDateTime,
  reason: z.string().nullable(),
});
export type PullRequestMergeQueueRemoval = z.infer<typeof PullRequestMergeQueueRemoval>;

export const PullRequestCommit = z.looseObject({
  oid: TrimmedNonEmptyString,
  messageHeadline: z.string(),
  committedDate: IsoDateTime,
  additions: NonNegativeInt.optional(),
  deletions: NonNegativeInt.optional(),
  authors: z.array(PullRequestActor).optional(),
});
export type PullRequestCommit = z.infer<typeof PullRequestCommit>;

export const PullRequestStackMembership = z.looseObject({
  number: PositiveInt,
  position: PositiveInt,
  size: PositiveInt,
  base: GitRefName,
});
export type PullRequestStackMembership = z.infer<typeof PullRequestStackMembership>;
