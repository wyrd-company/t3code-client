// ---
// relationships:
//   implements: library
// ---
import { z } from "zod";
import { NonNegativeInt } from "../../schemas/common.ts";
import {
  PullRequestActivity,
  PullRequestChangeBreakdown,
  PullRequestChecks,
  PullRequestDetail,
  PullRequestDiffFileContentsInput,
  PullRequestDiffFileContentsResult,
  PullRequestFilesViewedResult,
  PullRequestFilterOptions,
  PullRequestFilterOptionsInput,
  PullRequestLabelCandidateList,
  PullRequestLinkedThreadsResult,
  PullRequestListInput,
  PullRequestListResult,
  PullRequestListStatsInput,
  PullRequestListStatsResult,
  PullRequestPreview,
  PullRequestRef,
  PullRequestReviewGuideResult,
  PullRequestReviewerCandidateList,
  PullRequestRoutingIdentityInput,
  PullRequestRoutingIdentityResult,
  PullRequestRoutingResult,
  PullRequestStack,
  PullRequestSummary,
  PullRequestThreadCommentsInput,
  PullRequestThreadCommentsResult,
} from "../../schemas/pullRequests.ts";
import { defineMethod } from "../spec.ts";

export const pullRequestsMethods = {
  /** Rows arrive with zero line counts. `pullRequests.listStats` reads them. */
  "pullRequests.list": defineMethod({
    payload: PullRequestListInput,
    success: PullRequestListResult,
    stream: false,
    scope: "orchestration:read",
  }),
  "pullRequests.listStats": defineMethod({
    payload: PullRequestListStatsInput,
    success: PullRequestListStatsResult,
    stream: false,
    scope: "orchestration:read",
  }),
  "pullRequests.filterOptions": defineMethod({
    payload: PullRequestFilterOptionsInput,
    success: PullRequestFilterOptions,
    stream: false,
    scope: "orchestration:read",
  }),
  "pullRequests.summary": defineMethod({
    payload: PullRequestRef,
    success: PullRequestSummary,
    stream: false,
    scope: "orchestration:read",
  }),
  "pullRequests.routing": defineMethod({
    payload: PullRequestRef,
    success: PullRequestRoutingResult,
    stream: false,
    scope: "orchestration:read",
  }),
  "pullRequests.routingIdentity": defineMethod({
    payload: PullRequestRoutingIdentityInput,
    success: PullRequestRoutingIdentityResult,
    stream: false,
    scope: "orchestration:read",
  }),
  /** `null` when the pull request is in no stack. */
  "pullRequests.stack": defineMethod({
    payload: PullRequestRef,
    success: PullRequestStack.nullable(),
    stream: false,
    scope: "orchestration:read",
  }),
  "pullRequests.linkedThreads": defineMethod({
    payload: PullRequestRef,
    success: PullRequestLinkedThreadsResult,
    stream: false,
    scope: "orchestration:read",
  }),
  "pullRequests.detail": defineMethod({
    payload: PullRequestRef,
    success: PullRequestDetail,
    stream: false,
    scope: "orchestration:read",
  }),
  "pullRequests.preview": defineMethod({
    payload: PullRequestRef,
    success: PullRequestPreview,
    stream: false,
    scope: "orchestration:read",
  }),
  "pullRequests.checks": defineMethod({
    payload: PullRequestRef,
    success: PullRequestChecks.nullable(),
    stream: false,
    scope: "orchestration:read",
  }),
  "pullRequests.activity": defineMethod({
    payload: PullRequestRef,
    success: PullRequestActivity,
    stream: false,
    scope: "orchestration:read",
  }),
  /** Reads the stored guide. It starts no generation. */
  "pullRequests.reviewGuide": defineMethod({
    payload: PullRequestRef,
    success: PullRequestReviewGuideResult,
    stream: false,
    scope: "orchestration:read",
  }),
  /** The next comments of a review thread from its `nextCommentsCursor`. */
  "pullRequests.threadComments": defineMethod({
    payload: PullRequestThreadCommentsInput,
    success: PullRequestThreadCommentsResult,
    stream: false,
    scope: "orchestration:read",
  }),
  "pullRequests.diffFileContents": defineMethod({
    payload: PullRequestDiffFileContentsInput,
    success: PullRequestDiffFileContentsResult,
    stream: false,
    scope: "orchestration:read",
  }),
  "pullRequests.filesViewed": defineMethod({
    payload: PullRequestRef,
    success: PullRequestFilesViewedResult,
    stream: false,
    scope: "orchestration:read",
  }),
  "pullRequests.changeBreakdown": defineMethod({
    payload: PullRequestRef,
    success: PullRequestChangeBreakdown,
    stream: false,
    scope: "orchestration:read",
  }),
  "pullRequests.reviewerCandidates": defineMethod({
    payload: PullRequestRef,
    success: PullRequestReviewerCandidateList,
    stream: false,
    scope: "orchestration:read",
  }),
  "pullRequests.labelCandidates": defineMethod({
    payload: PullRequestRef,
    success: PullRequestLabelCandidateList,
    stream: false,
    scope: "orchestration:read",
  }),
  /** Each item is a new refresh revision, after which a caller reads again. No item until the first. */
  "pullRequests.subscribeRefreshes": defineMethod({
    payload: z.looseObject({}),
    success: NonNegativeInt,
    stream: true,
    scope: "orchestration:read",
  }),
};
