// ---
// relationships:
//   implements: design
// ---
import { z } from "zod";
import {
  IsoDateTime,
  NonNegativeInt,
  PositiveInt,
  ProjectId,
  TrimmedNonEmptyString,
  forwardCompatibleLiteral,
} from "../common.ts";

/** Mirrors `packages/contracts/src/threadPullRequest.ts` and the parts of `pullRequest.ts` it uses. */
export const ThreadLinkedPullRequest = z.looseObject({
  projectId: ProjectId,
  repository: TrimmedNonEmptyString,
  number: PositiveInt,
  url: TrimmedNonEmptyString,
});
export type ThreadLinkedPullRequest = z.infer<typeof ThreadLinkedPullRequest>;

export const ThreadPullRequestKey = z.looseObject({
  host: TrimmedNonEmptyString,
  repository: TrimmedNonEmptyString,
  number: PositiveInt,
});
export type ThreadPullRequestKey = z.infer<typeof ThreadPullRequestKey>;
export const ThreadPullRequestLinkSource = forwardCompatibleLiteral([
  "manual",
  "created",
  "agent",
  "stack",
  "stack-dismissed",
]);
export type ThreadPullRequestLinkSource = z.infer<typeof ThreadPullRequestLinkSource>;
export const PullRequestActor = z.looseObject({
  login: TrimmedNonEmptyString,
  name: z.string().nullable(),
  avatarUrl: z.string().nullable(),
});
export type PullRequestActor = z.infer<typeof PullRequestActor>;
export const PullRequestChecksState = forwardCompatibleLiteral(["passing", "failing", "pending"]);
export type PullRequestChecksState = z.infer<typeof PullRequestChecksState>;
export const PullRequestMergeability = forwardCompatibleLiteral([
  "mergeable",
  "conflicting",
  "unknown",
]);
export type PullRequestMergeability = z.infer<typeof PullRequestMergeability>;
export const PullRequestReviewDecision = forwardCompatibleLiteral([
  "approved",
  "changes-requested",
  "review-required",
]);
export type PullRequestReviewDecision = z.infer<typeof PullRequestReviewDecision>;
export const PullRequestState = forwardCompatibleLiteral(["open", "closed", "merged"]);
export type PullRequestState = z.infer<typeof PullRequestState>;
export const ThreadPullRequestSnapshot = z.looseObject({
  state: PullRequestState,
  title: TrimmedNonEmptyString,
  headBranch: TrimmedNonEmptyString,
  baseBranch: TrimmedNonEmptyString,
  isDraft: z.boolean(),
  updatedAt: IsoDateTime.nullable(),
  syncedAt: IsoDateTime,
  closedAt: z.string().nullable().optional(),
  mergedAt: z.string().nullable().optional(),
  author: PullRequestActor.nullable().optional(),
  additions: NonNegativeInt.optional(),
  deletions: NonNegativeInt.optional(),
  changedFiles: NonNegativeInt.optional(),
  reviewDecision: PullRequestReviewDecision.nullable().optional(),
  checksState: PullRequestChecksState.nullable().optional(),
  mergeability: PullRequestMergeability.optional(),
});
export type ThreadPullRequestSnapshot = z.infer<typeof ThreadPullRequestSnapshot>;
export const ThreadPullRequestStackLayer = z.looseObject({
  number: PositiveInt,
  headBranch: TrimmedNonEmptyString,
  state: PullRequestState,
});
export type ThreadPullRequestStackLayer = z.infer<typeof ThreadPullRequestStackLayer>;
export const ThreadPullRequestStack = z.looseObject({
  kind: z.literal("native"),
  id: TrimmedNonEmptyString,
  number: PositiveInt,
  url: TrimmedNonEmptyString,
  base: TrimmedNonEmptyString,
  layers: z.array(ThreadPullRequestStackLayer),
});
export type ThreadPullRequestStack = z.infer<typeof ThreadPullRequestStack>;
/** Present while the server watches the pull request for its thread. */
export const ThreadPullRequestWatch = z.looseObject({
  startedAt: IsoDateTime,
  headSha: TrimmedNonEmptyString.nullable(),
  failedChecks: z.array(TrimmedNonEmptyString),
  passed: z.boolean(),
  passedChecks: z.array(TrimmedNonEmptyString).default([]),
  remarksThrough: IsoDateTime,
  remarkIds: z.array(TrimmedNonEmptyString),
  conflicting: z.boolean(),
  wakes: NonNegativeInt,
});
export type ThreadPullRequestWatch = z.infer<typeof ThreadPullRequestWatch>;
export const ThreadPullRequestLink = z.looseObject({
  ...ThreadPullRequestKey.shape,
  url: TrimmedNonEmptyString,
  source: ThreadPullRequestLinkSource,
  linkedAt: IsoDateTime,
  snapshot: ThreadPullRequestSnapshot.nullable(),
  stack: ThreadPullRequestStack.nullable(),
  watch: ThreadPullRequestWatch.optional(),
});
export type ThreadPullRequestLink = z.infer<typeof ThreadPullRequestLink>;
