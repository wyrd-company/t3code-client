// ---
// relationships:
//   implements: library
// ---
/**
 * The inputs of the pull request read methods, with the closed values and bounds
 * of `packages/contracts/src/pullRequest.ts`. Unknown keys pass, for a newer server.
 */
import { z } from "zod";
import { PositiveInt, ProjectId, TrimmedNonEmptyString } from "./common.ts";

const QualifierValue = TrimmedNonEmptyString.max(200);
const QualifierValues = z.array(QualifierValue).max(10);

export const PullRequestListFilters = z.looseObject({
  draft: z.enum(["only", "hide"]).optional(),
  review: z.enum(["approved", "changes-requested", "review-required", "none"]).optional(),
  checks: z.enum(["passing", "failing"]).optional(),
  /** Every group must match. Any name within a group suffices. */
  labels: z.array(QualifierValues).max(10).optional(),
  excludedLabels: QualifierValues.optional(),
  /** `me` or `@me` names whoever is signed in to the host that is read. */
  author: QualifierValue.optional(),
});
export type PullRequestListFilters = z.infer<typeof PullRequestListFilters>;

/** One position for each repository, to pass back from `nextCursors`. */
export const PullRequestListCursors = z.record(
  TrimmedNonEmptyString,
  TrimmedNonEmptyString.max(4096),
);
export type PullRequestListCursors = z.infer<typeof PullRequestListCursors>;

export const PullRequestListInput = z.looseObject({
  state: z.enum(["all", "open", "closed", "merged"]),
  involvement: z.enum(["all", "reviewing", "authored"]).optional(),
  filters: PullRequestListFilters.optional(),
  projectId: ProjectId.optional(),
  projectIds: z.array(ProjectId).max(100).optional(),
  host: TrimmedNonEmptyString.optional(),
  limit: z.number().int().min(1).max(500).optional(),
  cursors: PullRequestListCursors.optional(),
  query: TrimmedNonEmptyString.max(200).optional(),
});
export type PullRequestListInput = z.infer<typeof PullRequestListInput>;

const pullRequestRefFields = {
  projectId: ProjectId,
  host: TrimmedNonEmptyString.optional(),
  /** Refuses the read unless the server's credential for `host` is this account. Needs `host`. */
  expectedAccountId: TrimmedNonEmptyString.optional(),
  allowStale: z.boolean().optional(),
  repository: TrimmedNonEmptyString,
  number: PositiveInt,
};

export const PullRequestRef = z.looseObject(pullRequestRefFields);
export type PullRequestRef = z.infer<typeof PullRequestRef>;

/** `query` asks the host for matches past the first page of candidates. */
export const PullRequestReviewerCandidatesInput = z.looseObject({
  ...pullRequestRefFields,
  query: TrimmedNonEmptyString.max(100).optional(),
});
export type PullRequestReviewerCandidatesInput = z.infer<typeof PullRequestReviewerCandidatesInput>;

export const PullRequestRoutingIdentityInput = z.looseObject({ host: TrimmedNonEmptyString });
export type PullRequestRoutingIdentityInput = z.infer<typeof PullRequestRoutingIdentityInput>;

export const PullRequestListStatsInput = z.looseObject({
  refs: z.array(PullRequestRef).max(500),
});
export type PullRequestListStatsInput = z.infer<typeof PullRequestListStatsInput>;

/** Scoped like `PullRequestListInput`, so the options come from the repositories it lists. */
export const PullRequestFilterOptionsInput = z.looseObject({
  kind: z.enum(["labels", "authors", "references"]),
  projectId: ProjectId.optional(),
  projectIds: z.array(ProjectId).max(100).optional(),
  host: TrimmedNonEmptyString.optional(),
  query: TrimmedNonEmptyString.max(100).optional(),
  /** For `references`, the sigil typed, so that a host can search only what it links. */
  sigil: z.enum(["#", "!"]).optional(),
});
export type PullRequestFilterOptionsInput = z.infer<typeof PullRequestFilterOptionsInput>;

/** A host can refuse a diff past a number of files, so a caller pages with `cursor`. */
export const PullRequestDiffInput = z.looseObject({
  ...pullRequestRefFields,
  cursor: TrimmedNonEmptyString.optional(),
  commit: TrimmedNonEmptyString.optional(),
});
export type PullRequestDiffInput = z.infer<typeof PullRequestDiffInput>;

export const PullRequestDiffFileContentsInput = z.looseObject({
  ...pullRequestRefFields,
  commit: TrimmedNonEmptyString.optional(),
  changeType: z.enum(["change", "rename-pure", "rename-changed", "new", "deleted"]),
  oldPath: TrimmedNonEmptyString,
  newPath: TrimmedNonEmptyString,
});
export type PullRequestDiffFileContentsInput = z.infer<typeof PullRequestDiffFileContentsInput>;

export const PullRequestThreadCommentsInput = z.looseObject({
  ...pullRequestRefFields,
  threadId: TrimmedNonEmptyString,
  cursor: TrimmedNonEmptyString,
});
export type PullRequestThreadCommentsInput = z.infer<typeof PullRequestThreadCommentsInput>;
