// ---
// relationships:
//   implements: library
// ---
/**
 * Mirrors the listing results of `packages/contracts/src/pullRequest.ts`.
 * A result stays open, so a newer server's values decode.
 */
import { z } from "zod";
import {
  IsoDateTime,
  NonNegativeInt,
  PositiveInt,
  ProjectId,
  TrimmedNonEmptyString,
  forwardCompatibleArray,
} from "./common.ts";
import { PullRequestListCursors } from "./pullRequestInputs.ts";
import {
  PullRequestAction,
  PullRequestActor,
  PullRequestChecksState,
  PullRequestLabel,
  PullRequestMergeability,
  PullRequestReviewDecision,
  PullRequestStackMembership,
  PullRequestState,
} from "./pullRequestParts.ts";
import { SourceControlProviderKind } from "./vcs.ts";

export const PullRequestListEntry = z.looseObject({
  stack: PullRequestStackMembership.optional(),
  provider: SourceControlProviderKind,
  host: TrimmedNonEmptyString,
  projectId: ProjectId,
  projectTitle: TrimmedNonEmptyString,
  repository: TrimmedNonEmptyString,
  number: PositiveInt,
  title: TrimmedNonEmptyString,
  url: TrimmedNonEmptyString,
  author: PullRequestActor.nullable(),
  headBranch: TrimmedNonEmptyString,
  baseBranch: TrimmedNonEmptyString,
  state: PullRequestState,
  isDraft: z.boolean(),
  mergeability: PullRequestMergeability,
  /** Zero until `pullRequests.listStats` reads it. A host's listing can omit the counts. */
  additions: NonNegativeInt,
  deletions: NonNegativeInt,
  createdAt: IsoDateTime,
  updatedAt: IsoDateTime,
  observedAt: z.number().optional(),
  viewerReviewRequested: z.boolean(),
  labels: z.array(PullRequestLabel),
  reviewDecision: PullRequestReviewDecision.optional(),
  checksState: PullRequestChecksState.optional(),
});
export type PullRequestListEntry = z.infer<typeof PullRequestListEntry>;

export const PullRequestProviderSummary = z.looseObject({
  host: TrimmedNonEmptyString,
  kind: SourceControlProviderKind,
  searchesOnHost: z.boolean(),
  actions: forwardCompatibleArray(PullRequestAction).optional(),
  projectCount: PositiveInt,
  configured: z.boolean(),
  detail: TrimmedNonEmptyString.nullable(),
});
export type PullRequestProviderSummary = z.infer<typeof PullRequestProviderSummary>;

export const PullRequestListResult = z.looseObject({
  /** The viewer of each host. A host that cannot be read is absent. */
  viewers: z.record(TrimmedNonEmptyString, TrimmedNonEmptyString),
  providers: z.array(PullRequestProviderSummary),
  /** Sort again after appending a page: one repository's older rows can outrank another's. */
  entries: z.array(PullRequestListEntry),
  errors: z.array(
    z.looseObject({
      projectId: ProjectId,
      projectTitle: TrimmedNonEmptyString,
      message: TrimmedNonEmptyString,
    }),
  ),
  truncated: z.boolean(),
  nextCursors: PullRequestListCursors,
});
export type PullRequestListResult = z.infer<typeof PullRequestListResult>;

export const PullRequestListStatsResult = z.looseObject({
  stats: z.array(
    z.looseObject({
      projectId: ProjectId,
      repository: TrimmedNonEmptyString,
      number: PositiveInt,
      additions: NonNegativeInt,
      deletions: NonNegativeInt,
    }),
  ),
});
export type PullRequestListStatsResult = z.infer<typeof PullRequestListStatsResult>;

export const PullRequestFilterOptions = z.looseObject({
  labels: z.array(PullRequestLabel),
  authors: z.array(PullRequestActor),
  truncated: z.boolean(),
});
export type PullRequestFilterOptions = z.infer<typeof PullRequestFilterOptions>;
