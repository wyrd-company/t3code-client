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

export const PullRequestMergeMethod = forwardCompatibleLiteral(["merge", "squash", "rebase"]);
export type PullRequestMergeMethod = z.infer<typeof PullRequestMergeMethod>;

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
  base: TrimmedNonEmptyString,
});
export type PullRequestStackMembership = z.infer<typeof PullRequestStackMembership>;
