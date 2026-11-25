// ---
// relationships:
//   implements: library
// ---
import { z } from "zod";
import {
  GitRefName,
  NonNegativeInt,
  PositiveInt,
  TrimmedNonEmptyString,
  forwardCompatibleLiteral,
  taggedUnionWithUnknown,
} from "./common.ts";

export const VcsStatusChangeRequestState = forwardCompatibleLiteral(["open", "closed", "merged"]);
export type VcsStatusChangeRequestState = z.infer<typeof VcsStatusChangeRequestState>;
export const VcsRef = z.looseObject({
  name: GitRefName,
  isRemote: z.boolean().optional(),
  remoteName: GitRefName.optional(),
  upstreamRef: GitRefName.optional(),
  current: z.boolean(),
  isDefault: z.boolean(),
  worktreePath: TrimmedNonEmptyString.nullable(),
});
export type VcsRef = z.infer<typeof VcsRef>;
export const VcsWorktree = z.looseObject({
  path: TrimmedNonEmptyString,
  refName: GitRefName,
});
export type VcsWorktree = z.infer<typeof VcsWorktree>;
export const VcsStatusInput = z.looseObject({ cwd: TrimmedNonEmptyString });
export type VcsStatusInput = z.infer<typeof VcsStatusInput>;
/** The checked-out branch of a working tree; null when HEAD is detached or there is no repository. */
export const VcsBranchStatus = z.looseObject({
  refName: z.string().nullable(),
  /** False once the checkout is gone. Older servers omit it and show a detached HEAD instead. */
  isRepo: z.boolean().optional(),
});
export type VcsBranchStatus = z.infer<typeof VcsBranchStatus>;
export const VcsStatusSubscriptionInput = z.looseObject({
  cwd: TrimmedNonEmptyString,
  /** A passive observer gets cached remote status and keeps no refresh loop alive. */
  includeRemote: z.boolean().optional(),
});
export type VcsStatusSubscriptionInput = z.infer<typeof VcsStatusSubscriptionInput>;
export const VcsPullInput = z.looseObject({ cwd: TrimmedNonEmptyString });
export type VcsPullInput = z.infer<typeof VcsPullInput>;
export const VcsPullResult = z.looseObject({
  status: forwardCompatibleLiteral(["pulled", "skipped_up_to_date"]),
  refName: GitRefName,
  upstreamRef: GitRefName.nullable(),
});
export type VcsPullResult = z.infer<typeof VcsPullResult>;
export const VcsDriverKind = z.enum(["git", "jj", "unknown"]);
export type VcsDriverKind = z.infer<typeof VcsDriverKind>;
export const VcsInitInput = z.looseObject({
  cwd: TrimmedNonEmptyString,
  kind: VcsDriverKind.optional(),
});
export type VcsInitInput = z.infer<typeof VcsInitInput>;
export const VcsRefreshStatusInput = z.looseObject({
  cwd: TrimmedNonEmptyString,
  /** Refresh only the local state and keep the remote state the server already has. */
  localOnly: z.boolean().optional(),
});
export type VcsRefreshStatusInput = z.infer<typeof VcsRefreshStatusInput>;
export const GIT_LIST_BRANCHES_MAX_LIMIT = 200;
export const VcsListRefsInput = z.looseObject({
  cwd: TrimmedNonEmptyString,
  query: TrimmedNonEmptyString.max(256).optional(),
  cursor: NonNegativeInt.optional(),
  includeMatchingRemoteRefs: z.boolean().optional(),
  refKind: z.enum(["all", "local", "remote"]).optional(),
  refresh: z.boolean().optional(),
  limit: PositiveInt.max(GIT_LIST_BRANCHES_MAX_LIMIT).optional(),
});
export type VcsListRefsInput = z.infer<typeof VcsListRefsInput>;
export const VcsCreateWorktreeInput = z.looseObject({
  cwd: TrimmedNonEmptyString,
  refName: GitRefName,
  newRefName: GitRefName.optional(),
  baseRefName: GitRefName.optional(),
  /** Required on the wire; the server selects the managed worktree folder. */
  path: z.null(),
});
export type VcsCreateWorktreeInput = z.infer<typeof VcsCreateWorktreeInput>;
export const VcsRemoveWorktreeInput = z.looseObject({
  cwd: TrimmedNonEmptyString,
  path: TrimmedNonEmptyString,
  force: z.boolean().optional(),
});
export type VcsRemoveWorktreeInput = z.infer<typeof VcsRemoveWorktreeInput>;
export const VcsCreateRefInput = z.looseObject({
  cwd: TrimmedNonEmptyString,
  refName: GitRefName,
  switchRef: z.boolean().optional(),
});
export type VcsCreateRefInput = z.infer<typeof VcsCreateRefInput>;
export const VcsCreateRefResult = z.looseObject({ refName: GitRefName });
export type VcsCreateRefResult = z.infer<typeof VcsCreateRefResult>;
export const VcsSwitchRefInput = z.looseObject({
  cwd: TrimmedNonEmptyString,
  refName: GitRefName,
});
export type VcsSwitchRefInput = z.infer<typeof VcsSwitchRefInput>;
export const VcsStatusChangeRequest = z.looseObject({
  number: PositiveInt,
  title: TrimmedNonEmptyString,
  url: z.string(),
  baseRef: GitRefName,
  headRef: GitRefName,
  state: VcsStatusChangeRequestState,
  isDraft: z.boolean().optional(),
  updatedAt: z.string().nullable().optional(),
});
export type VcsStatusChangeRequest = z.infer<typeof VcsStatusChangeRequest>;
/**
 * An open slug naming a source control host, such as `github`. `unknown` is a
 * remote the server cannot attribute to any host.
 */
export const SourceControlProviderKind = TrimmedNonEmptyString.max(64).regex(/^[a-z][a-z0-9-]*$/);
export type SourceControlProviderKind = z.infer<typeof SourceControlProviderKind>;
export const SourceControlProviderInfo = z.looseObject({
  kind: SourceControlProviderKind,
  name: TrimmedNonEmptyString,
  baseUrl: z.string(),
});
export type SourceControlProviderInfo = z.infer<typeof SourceControlProviderInfo>;
export const VcsStatusLocalShape = {
  isRepo: z.boolean(),
  sourceControlProvider: SourceControlProviderInfo.optional(),
  hasPrimaryRemote: z.boolean(),
  isDefaultRef: z.boolean(),
  refName: GitRefName.nullable(),
  hasWorkingTreeChanges: z.boolean(),
  workingTree: z.looseObject({
    rootPath: z.string().min(1).optional(),
    files: z.array(
      z.looseObject({
        path: z.string().min(1),
        insertions: NonNegativeInt,
        deletions: NonNegativeInt,
      }),
    ),
    insertions: NonNegativeInt,
    deletions: NonNegativeInt,
  }),
  branchChanges: z
    .looseObject({
      baseRef: GitRefName.nullable(),
      insertions: NonNegativeInt,
      deletions: NonNegativeInt,
    })
    .optional(),
};
export const VcsStatusRemoteShape = {
  hasUpstream: z.boolean(),
  aheadCount: NonNegativeInt,
  behindCount: NonNegativeInt,
  aheadOfDefaultCount: NonNegativeInt.optional(),
  pr: VcsStatusChangeRequest.nullable(),
};
export const VcsStatusLocalResult = z.looseObject(VcsStatusLocalShape);
export type VcsStatusLocalResult = z.infer<typeof VcsStatusLocalResult>;
export const VcsStatusRemoteResult = z.looseObject(VcsStatusRemoteShape);
export type VcsStatusRemoteResult = z.infer<typeof VcsStatusRemoteResult>;
export const VcsStatusResult = z.looseObject({ ...VcsStatusLocalShape, ...VcsStatusRemoteShape });
export type VcsStatusResult = z.infer<typeof VcsStatusResult>;
/** `vcs.refreshStatus`: the status, and a digest of the refs after the refresh when readable. */
export const VcsRefreshStatusResult = z.looseObject({
  ...VcsStatusResult.shape,
  refsDigest: TrimmedNonEmptyString.optional(),
});
export type VcsRefreshStatusResult = z.infer<typeof VcsRefreshStatusResult>;
export const VcsStatusStreamEvent = taggedUnionWithUnknown("_tag", [
  z.looseObject({
    _tag: z.literal("snapshot"),
    local: VcsStatusLocalResult,
    remote: VcsStatusRemoteResult.nullable(),
  }),
  z.looseObject({ _tag: z.literal("localUpdated"), local: VcsStatusLocalResult }),
  z.looseObject({ _tag: z.literal("remoteUpdated"), remote: VcsStatusRemoteResult.nullable() }),
]);
export type VcsStatusStreamEvent = z.infer<typeof VcsStatusStreamEvent>;
export const VcsListRefsResult = z.looseObject({
  isAtRepositoryRoot: z.boolean().optional(),
  refs: z.array(VcsRef),
  isRepo: z.boolean(),
  hasPrimaryRemote: z.boolean(),
  nextCursor: NonNegativeInt.nullable(),
  totalCount: NonNegativeInt,
});
export type VcsListRefsResult = z.infer<typeof VcsListRefsResult>;
export const VcsCreateWorktreeResult = z.looseObject({ worktree: VcsWorktree });
export type VcsCreateWorktreeResult = z.infer<typeof VcsCreateWorktreeResult>;
export const VcsSwitchRefResult = z.looseObject({
  refName: GitRefName.nullable(),
});
export type VcsSwitchRefResult = z.infer<typeof VcsSwitchRefResult>;
