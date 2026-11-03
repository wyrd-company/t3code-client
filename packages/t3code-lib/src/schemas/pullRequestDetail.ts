// ---
// relationships:
//   implements: library
// ---
/**
 * Mirrors the results of `packages/contracts/src/pullRequest.ts` that read one pull
 * request: what the host can do, what the viewer can do, and the detail built on them.
 * A result stays open, so a newer server's values decode.
 */
import { z } from "zod";
import {
  IsoDateTime,
  NonNegativeInt,
  PositiveInt,
  ProjectId,
  ThreadId,
  TrimmedNonEmptyString,
  forwardCompatibleArray,
  forwardCompatibleLiteral,
} from "./common.ts";
import {
  PullRequestAction,
  PullRequestActor,
  PullRequestCheck,
  PullRequestChecksState,
  PullRequestComment,
  PullRequestCommit,
  PullRequestLabel,
  PullRequestMergeMethod,
  PullRequestMergeability,
  PullRequestReaction,
  PullRequestReviewDecision,
  PullRequestReviewThread,
  PullRequestReviewVerdict,
  PullRequestStackMembership,
  PullRequestState,
  PullRequestThreadComment,
  PullRequestUpdateMethod,
} from "./pullRequestParts.ts";
import { SourceControlProviderKind } from "./vcs.ts";

/** What the host can do. A capability that a provider does not name is one it does not offer. */
export const PullRequestCapabilities = z.looseObject({
  diff: z.boolean(),
  comment: z.boolean(),
  actions: forwardCompatibleArray(PullRequestAction),
  mergeMethods: forwardCompatibleArray(PullRequestMergeMethod),
  deleteBranch: z.boolean().optional(),
  updateMethods: forwardCompatibleArray(PullRequestUpdateMethod).optional(),
  search: z.boolean(),
  reactions: z.boolean().optional(),
  viewedFiles: forwardCompatibleLiteral(["host", "environment"]).optional(),
  review: z.looseObject({
    inlineComment: z.boolean(),
    /** Absent means that an inline comment covers one line. */
    rangeComment: z.boolean().optional(),
    reply: z.boolean(),
    resolve: z.boolean(),
    verdicts: forwardCompatibleArray(PullRequestReviewVerdict),
  }),
  reviewers: z.looseObject({ request: z.boolean(), listCandidates: z.boolean() }),
  edit: z
    .looseObject({
      changeRequest: z.boolean(),
      comment: z.boolean(),
      maintainerEdits: z.boolean().optional(),
    })
    .optional(),
  stacks: z.boolean().optional(),
  stackActions: z.boolean().optional(),
  labels: z.boolean().optional(),
  /** Absent means that an empty check list says nothing. */
  checksAlwaysReport: z.boolean().optional(),
});
export type PullRequestCapabilities = z.infer<typeof PullRequestCapabilities>;

/** What the viewer can do. A permission that the host does not report is granted. */
export const PullRequestViewerPermissions = z.looseObject({
  stackRebase: z.boolean().optional(),
  actions: forwardCompatibleArray(PullRequestAction),
  comment: z.boolean(),
  resolve: z.boolean(),
  verdicts: forwardCompatibleArray(PullRequestReviewVerdict),
  requestReviewers: z.boolean(),
  updateMethods: forwardCompatibleArray(PullRequestUpdateMethod).optional(),
  labels: z.boolean().optional(),
  editChangeRequest: z.boolean().optional(),
  maintainerEdits: z.boolean().optional(),
});
export type PullRequestViewerPermissions = z.infer<typeof PullRequestViewerPermissions>;

export const PullRequestDetail = z.looseObject({
  provider: SourceControlProviderKind,
  capabilities: PullRequestCapabilities,
  viewerPermissions: PullRequestViewerPermissions,
  projectId: ProjectId,
  projectTitle: TrimmedNonEmptyString,
  workspaceRoot: TrimmedNonEmptyString,
  repository: TrimmedNonEmptyString,
  number: PositiveInt,
  title: TrimmedNonEmptyString,
  body: z.string(),
  url: TrimmedNonEmptyString,
  author: PullRequestActor.nullable(),
  state: PullRequestState,
  isDraft: z.boolean(),
  mergeability: PullRequestMergeability,
  additions: NonNegativeInt,
  deletions: NonNegativeInt,
  changedFiles: NonNegativeInt,
  headBranch: TrimmedNonEmptyString,
  headRepositoryNameWithOwner: TrimmedNonEmptyString.nullable().optional(),
  headSha: TrimmedNonEmptyString.optional(),
  baseBranch: TrimmedNonEmptyString,
  createdAt: IsoDateTime,
  updatedAt: IsoDateTime,
  observedAt: z.number().optional(),
  mergedAt: IsoDateTime.nullable(),
  closedAt: IsoDateTime.nullable(),
  reviewers: z.array(PullRequestActor),
  labels: z.array(PullRequestLabel),
  checks: z.array(PullRequestCheck),
  mergeCapabilities: z.looseObject({
    merge: z.boolean(),
    squash: z.boolean(),
    rebase: z.boolean(),
  }),
  viewer: TrimmedNonEmptyString.optional(),
  baseComparison: forwardCompatibleLiteral(["up-to-date", "behind", "unknown"]).optional(),
  behindBy: NonNegativeInt.optional(),
  /** Absent means that the host does not report auto-merge, not that it is off. */
  autoMergeEnabled: z.boolean().optional(),
  autoMergeMethod: PullRequestMergeMethod.optional(),
  workflowApprovalsRequired: NonNegativeInt.optional(),
  maintainerCanModify: z.boolean().optional(),
});
export type PullRequestDetail = z.infer<typeof PullRequestDetail>;

export const PullRequestSummary = z.looseObject({
  provider: SourceControlProviderKind,
  projectId: ProjectId,
  repository: TrimmedNonEmptyString,
  number: PositiveInt,
  title: TrimmedNonEmptyString,
  url: TrimmedNonEmptyString,
  state: PullRequestState,
  isDraft: z.boolean().optional(),
  headBranch: TrimmedNonEmptyString,
  baseBranch: TrimmedNonEmptyString,
  closedAt: z.string().nullable().optional(),
  mergedAt: z.string().nullable().optional(),
  updatedAt: IsoDateTime,
  observedAt: z.number().optional(),
  author: PullRequestActor.nullable().optional(),
  additions: NonNegativeInt.optional(),
  deletions: NonNegativeInt.optional(),
  changedFiles: NonNegativeInt.optional(),
  reviewDecision: PullRequestReviewDecision.nullable().optional(),
  checksState: PullRequestChecksState.nullable().optional(),
  mergeability: PullRequestMergeability.optional(),
  /** `null` when the host says that it is in no stack. Absent when the read did not ask. */
  stack: PullRequestStackMembership.nullable().optional(),
});
export type PullRequestSummary = z.infer<typeof PullRequestSummary>;

export const PullRequestPreview = z.looseObject({
  projectId: ProjectId,
  repository: TrimmedNonEmptyString,
  number: PositiveInt,
  title: TrimmedNonEmptyString,
  url: TrimmedNonEmptyString,
  author: PullRequestActor.nullable(),
  state: PullRequestState,
  isDraft: z.boolean(),
  createdAt: IsoDateTime,
});
export type PullRequestPreview = z.infer<typeof PullRequestPreview>;

export const PullRequestStack = z.looseObject({
  id: TrimmedNonEmptyString,
  number: PositiveInt,
  url: TrimmedNonEmptyString,
  base: TrimmedNonEmptyString,
  layers: z.array(
    z.looseObject({
      number: PositiveInt,
      title: z.string().optional(),
      isDraft: z.boolean().optional(),
      headSha: TrimmedNonEmptyString.optional(),
      headBranch: TrimmedNonEmptyString,
      state: PullRequestState,
    }),
  ),
});
export type PullRequestStack = z.infer<typeof PullRequestStack>;

export const PullRequestChecks = z.looseObject({
  observedAt: z.number().optional(),
  state: PullRequestState,
  checks: z.array(PullRequestCheck),
});
export type PullRequestChecks = z.infer<typeof PullRequestChecks>;

export const PullRequestActivity = z.looseObject({
  author: PullRequestActor.nullable().optional(),
  reviewers: z.array(PullRequestActor).optional(),
  comments: z.array(PullRequestComment),
  commentCount: NonNegativeInt,
  commentsTruncated: z.boolean(),
  reviewThreadsTruncated: z.boolean().optional(),
  reviewThreads: z.array(PullRequestReviewThread),
  commits: z.array(PullRequestCommit),
  reactions: z.array(PullRequestReaction).optional(),
});
export type PullRequestActivity = z.infer<typeof PullRequestActivity>;

export const PullRequestThreadCommentsResult = z.looseObject({
  comments: z.array(PullRequestThreadComment),
  nextCursor: TrimmedNonEmptyString.nullable(),
});
export type PullRequestThreadCommentsResult = z.infer<typeof PullRequestThreadCommentsResult>;

export const PullRequestRoutingIdentityResult = z.looseObject({
  accountId: TrimmedNonEmptyString,
  host: TrimmedNonEmptyString,
  provider: SourceControlProviderKind,
  viewer: TrimmedNonEmptyString,
});
export type PullRequestRoutingIdentityResult = z.infer<typeof PullRequestRoutingIdentityResult>;

export const PullRequestRoutingResult = z.looseObject({
  accountId: TrimmedNonEmptyString,
  host: TrimmedNonEmptyString,
  provider: SourceControlProviderKind,
  viewer: TrimmedNonEmptyString,
  projectTitle: TrimmedNonEmptyString,
  workspaceRoot: TrimmedNonEmptyString,
});
export type PullRequestRoutingResult = z.infer<typeof PullRequestRoutingResult>;

export const PullRequestLinkedThreadsResult = z.looseObject({
  threads: z.array(
    z.looseObject({
      id: ThreadId,
      projectId: ProjectId,
      title: z.string(),
      archivedAt: IsoDateTime.nullable(),
    }),
  ),
});
export type PullRequestLinkedThreadsResult = z.infer<typeof PullRequestLinkedThreadsResult>;

export const PullRequestReviewerCandidateList = z.looseObject({
  candidates: z.array(
    z.looseObject({
      ...PullRequestActor.shape,
      id: TrimmedNonEmptyString,
      kind: forwardCompatibleLiteral(["user", "team"]),
      isRequested: z.boolean(),
    }),
  ),
  truncated: z.boolean(),
});
export type PullRequestReviewerCandidateList = z.infer<typeof PullRequestReviewerCandidateList>;

export const PullRequestLabelCandidateList = z.looseObject({
  candidates: z.array(
    z.looseObject({
      ...PullRequestLabel.shape,
      description: z.string().nullable(),
      isApplied: z.boolean(),
    }),
  ),
  truncated: z.boolean(),
});
export type PullRequestLabelCandidateList = z.infer<typeof PullRequestLabelCandidateList>;
