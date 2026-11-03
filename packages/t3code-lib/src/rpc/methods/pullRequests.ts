// ---
// relationships:
//   implements: library
// ---
import { z } from "zod";
import { NonNegativeInt } from "../../schemas/common.ts";
import {
  PullRequestActionInput,
  PullRequestActivity,
  PullRequestChangeBreakdown,
  PullRequestChecks,
  PullRequestCommentInput,
  PullRequestCommentUpdateInput,
  PullRequestDetail,
  PullRequestDiffFileContentsInput,
  PullRequestDiffFileContentsResult,
  PullRequestFilesViewedResult,
  PullRequestFilterOptions,
  PullRequestFilterOptionsInput,
  PullRequestInvalidateInput,
  PullRequestLabelCandidateList,
  PullRequestLabelChangeInput,
  PullRequestLinkedThreadsResult,
  PullRequestListInput,
  PullRequestListResult,
  PullRequestListStatsInput,
  PullRequestListStatsResult,
  PullRequestPreview,
  PullRequestReactionInput,
  PullRequestRef,
  PullRequestReportStateInput,
  PullRequestReviewerCandidateList,
  PullRequestReviewerRequestInput,
  PullRequestReviewGuideResult,
  PullRequestRoutingIdentityInput,
  PullRequestRoutingIdentityResult,
  PullRequestRoutingResult,
  PullRequestSetFilesViewedInput,
  PullRequestStack,
  PullRequestSubmitReviewInput,
  PullRequestSummary,
  PullRequestThreadCommentsInput,
  PullRequestThreadCommentsResult,
  PullRequestThreadReplyInput,
  PullRequestThreadResolutionInput,
  PullRequestUpdateInput,
} from "../../schemas/pullRequests.ts";
import { VoidSuccess, defineMethod } from "../spec.ts";

/** A write that the server sends to the host with its own credential. */
const hostWrite = <Payload extends z.ZodType>(payload: Payload) =>
  defineMethod({
    payload,
    success: VoidSuccess,
    stream: false,
    scope: "source-control:write",
  });

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
  /**
   * Starts a run with the review guide model, if none runs for this head, and answers
   * at once. `pullRequests.reviewGuide` reads the run and then the guide. Needs
   * `reviewGuidesEnabled`, and a project that is a checkout of the repository.
   */
  "pullRequests.generateReviewGuide": defineMethod({
    payload: PullRequestRef,
    success: PullRequestReviewGuideResult,
    stream: false,
    scope: "orchestration:operate",
  }),
  /** Drops cached reads, so that the next read asks the host, and tells subscribers to read again. */
  "pullRequests.invalidate": defineMethod({
    payload: PullRequestInvalidateInput,
    success: VoidSuccess,
    stream: false,
    scope: "orchestration:read",
  }),
  /** Tells the server the state that a client read, so that it can sync a linked thread. */
  "pullRequests.reportState": defineMethod({
    payload: PullRequestReportStateInput,
    success: VoidSuccess,
    stream: false,
    scope: "orchestration:read",
  }),
  /** Marks are on the host or on this server, as `capabilities.viewedFiles` says. */
  "pullRequests.setFilesViewed": hostWrite(PullRequestSetFilesViewedInput),
  "pullRequests.runAction": hostWrite(PullRequestActionInput),
  "pullRequests.update": hostWrite(PullRequestUpdateInput),
  "pullRequests.comment": hostWrite(PullRequestCommentInput),
  "pullRequests.updateComment": hostWrite(PullRequestCommentUpdateInput),
  /** A host with no pending review can post part of a review and then fail. The verdict is last. */
  "pullRequests.submitReview": hostWrite(PullRequestSubmitReviewInput),
  "pullRequests.replyToThread": hostWrite(PullRequestThreadReplyInput),
  "pullRequests.setThreadResolution": hostWrite(PullRequestThreadResolutionInput),
  "pullRequests.setReaction": hostWrite(PullRequestReactionInput),
  "pullRequests.requestReviewers": hostWrite(PullRequestReviewerRequestInput),
  "pullRequests.setLabels": hostWrite(PullRequestLabelChangeInput),
};
