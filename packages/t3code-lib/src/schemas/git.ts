// ---
// relationships:
//   implements: library
// ---
/** Stacked Git actions and pull request resolution, mirroring the contracts' `git.ts`. */
import { z } from "zod";
import {
  PositiveInt,
  NonNegativeInt,
  ProjectId,
  ThreadId,
  TrimmedNonEmptyString,
  forwardCompatibleLiteral,
  taggedUnionWithUnknown,
} from "./common.ts";

const stackedActions = ["commit", "push", "create_pr", "commit_push", "commit_push_pr"] as const;
export const GitStackedActionInput = z.enum(stackedActions);
export type GitStackedActionInput = z.infer<typeof GitStackedActionInput>;
export const GitStackedAction = forwardCompatibleLiteral(stackedActions);
export type GitStackedAction = z.infer<typeof GitStackedAction>;
export const GitActionProgressPhase = forwardCompatibleLiteral(["branch", "commit", "push", "pr"]);
export type GitActionProgressPhase = z.infer<typeof GitActionProgressPhase>;
export const GitActionProgressStream = forwardCompatibleLiteral(["stdout", "stderr"]);
export type GitActionProgressStream = z.infer<typeof GitActionProgressStream>;

export const GitRunStackedActionInput = z.looseObject({
  actionId: TrimmedNonEmptyString,
  cwd: TrimmedNonEmptyString,
  action: GitStackedActionInput,
  commitMessage: TrimmedNonEmptyString.max(10_000).optional(),
  featureBranch: z.boolean().optional(),
  filePaths: z.array(z.string().min(1)).min(1).optional(),
  threadId: ThreadId.optional(),
  projectId: ProjectId.optional(),
});
export type GitRunStackedActionInput = z.infer<typeof GitRunStackedActionInput>;

export const GitPullRequestRefInput = z.looseObject({
  cwd: TrimmedNonEmptyString,
  reference: TrimmedNonEmptyString,
});
export type GitPullRequestRefInput = z.infer<typeof GitPullRequestRefInput>;
export const GitPreparePullRequestThreadInput = z.looseObject({
  ...GitPullRequestRefInput.shape,
  mode: z.enum(["local", "worktree"]),
  threadId: ThreadId.optional(),
});
export type GitPreparePullRequestThreadInput = z.infer<typeof GitPreparePullRequestThreadInput>;

export const GitResolvedPullRequest = z.looseObject({
  number: PositiveInt,
  title: TrimmedNonEmptyString,
  url: z.string(),
  baseBranch: TrimmedNonEmptyString,
  headBranch: TrimmedNonEmptyString,
  state: forwardCompatibleLiteral(["open", "closed", "merged"]),
});
export type GitResolvedPullRequest = z.infer<typeof GitResolvedPullRequest>;
export const GitResolvePullRequestResult = z.looseObject({ pullRequest: GitResolvedPullRequest });
export type GitResolvePullRequestResult = z.infer<typeof GitResolvePullRequestResult>;
export const GitPreparePullRequestThreadResult = z.looseObject({
  pullRequest: GitResolvedPullRequest,
  branch: TrimmedNonEmptyString,
  worktreePath: TrimmedNonEmptyString.nullable(),
  /** False when local commits or edits kept a reused worktree from the pull request's head. */
  isOnPullRequestHead: z.boolean().default(true),
});
export type GitPreparePullRequestThreadResult = z.infer<typeof GitPreparePullRequestThreadResult>;

export const GitRunStackedActionToastCta = taggedUnionWithUnknown("kind", [
  z.looseObject({ kind: z.literal("none") }),
  z.looseObject({ kind: z.literal("open_pr"), label: TrimmedNonEmptyString, url: z.string() }),
  z.looseObject({
    kind: z.literal("run_action"),
    label: TrimmedNonEmptyString,
    action: z.looseObject({ kind: GitStackedAction }),
  }),
]);
export type GitRunStackedActionToastCta = z.infer<typeof GitRunStackedActionToastCta>;
export const GitRunStackedActionResult = z.looseObject({
  action: GitStackedAction,
  branch: z.looseObject({
    status: forwardCompatibleLiteral(["created", "skipped_not_requested"]),
    name: TrimmedNonEmptyString.optional(),
  }),
  commit: z.looseObject({
    status: forwardCompatibleLiteral(["created", "skipped_no_changes", "skipped_not_requested"]),
    commitSha: TrimmedNonEmptyString.optional(),
    subject: TrimmedNonEmptyString.optional(),
  }),
  push: z.looseObject({
    status: forwardCompatibleLiteral(["pushed", "skipped_not_requested", "skipped_up_to_date"]),
    branch: TrimmedNonEmptyString.optional(),
    upstreamBranch: TrimmedNonEmptyString.optional(),
    setUpstream: z.boolean().optional(),
  }),
  pr: z.looseObject({
    status: forwardCompatibleLiteral(["created", "opened_existing", "skipped_not_requested"]),
    url: z.string().optional(),
    number: PositiveInt.optional(),
    baseBranch: TrimmedNonEmptyString.optional(),
    headBranch: TrimmedNonEmptyString.optional(),
    title: TrimmedNonEmptyString.optional(),
  }),
  toast: z.looseObject({
    title: TrimmedNonEmptyString,
    description: TrimmedNonEmptyString.optional(),
    cta: GitRunStackedActionToastCta,
  }),
});
export type GitRunStackedActionResult = z.infer<typeof GitRunStackedActionResult>;

const progressBase = {
  actionId: TrimmedNonEmptyString,
  cwd: TrimmedNonEmptyString,
  action: GitStackedAction,
};
export const GitActionProgressEvent = taggedUnionWithUnknown("kind", [
  z.looseObject({
    ...progressBase,
    kind: z.literal("action_started"),
    phases: z.array(GitActionProgressPhase),
  }),
  z.looseObject({
    ...progressBase,
    kind: z.literal("phase_started"),
    phase: GitActionProgressPhase,
    label: TrimmedNonEmptyString,
  }),
  z.looseObject({
    ...progressBase,
    kind: z.literal("hook_started"),
    hookName: TrimmedNonEmptyString,
  }),
  z.looseObject({
    ...progressBase,
    kind: z.literal("hook_output"),
    hookName: TrimmedNonEmptyString.nullable(),
    stream: GitActionProgressStream,
    text: TrimmedNonEmptyString,
  }),
  z.looseObject({
    ...progressBase,
    kind: z.literal("hook_finished"),
    hookName: TrimmedNonEmptyString,
    exitCode: z.number().int().nullable(),
    durationMs: NonNegativeInt.nullable(),
  }),
  z.looseObject({
    ...progressBase,
    kind: z.literal("action_finished"),
    result: GitRunStackedActionResult,
  }),
  z.looseObject({
    ...progressBase,
    kind: z.literal("action_failed"),
    phase: GitActionProgressPhase.nullable(),
    message: TrimmedNonEmptyString,
  }),
]);
export type GitActionProgressEvent = z.infer<typeof GitActionProgressEvent>;
