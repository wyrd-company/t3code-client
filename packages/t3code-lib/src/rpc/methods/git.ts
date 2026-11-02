// ---
// relationships:
//   implements: library
// ---
import { defineMethod } from "../spec.ts";
import {
  GitActionProgressEvent,
  GitPreparePullRequestThreadInput,
  GitPreparePullRequestThreadResult,
  GitPullRequestRefInput,
  GitResolvePullRequestResult,
  GitRunStackedActionInput,
} from "../../schemas/git.ts";
import {
  ReviewBranchCommitsInput,
  ReviewBranchCommitsResult,
  ReviewDiffFileContentsInput,
  ReviewDiffFileContentsResult,
  ReviewDiffPreviewInput,
  ReviewDiffPreviewResult,
} from "../../schemas/review.ts";

export const gitMethods = {
  "git.runStackedAction": defineMethod({
    payload: GitRunStackedActionInput,
    success: GitActionProgressEvent,
    stream: true,
    scope: "source-control:write",
    // A created pull request links to the thread, which the server reads first.
    payloadScopes: ({ threadId, action }) =>
      threadId !== undefined && (action === "create_pr" || action === "commit_push_pr")
        ? ["orchestration:read"]
        : [],
  }),
  "git.resolvePullRequest": defineMethod({
    payload: GitPullRequestRefInput,
    success: GitResolvePullRequestResult,
    stream: false,
    scope: "orchestration:read",
  }),
  "git.preparePullRequestThread": defineMethod({
    payload: GitPreparePullRequestThreadInput,
    success: GitPreparePullRequestThreadResult,
    stream: false,
    scope: "source-control:write",
    // A new worktree for an existing thread also changes that thread.
    payloadScopes: ({ mode, threadId }) =>
      mode === "worktree" && threadId !== undefined ? ["orchestration:operate"] : [],
  }),
  "review.getBranchCommits": defineMethod({
    payload: ReviewBranchCommitsInput,
    success: ReviewBranchCommitsResult,
    stream: false,
    scope: "filesystem:read",
  }),
  "review.getDiffPreview": defineMethod({
    payload: ReviewDiffPreviewInput,
    success: ReviewDiffPreviewResult,
    stream: false,
    scope: "filesystem:read",
  }),
  "review.getDiffFileContents": defineMethod({
    payload: ReviewDiffFileContentsInput,
    success: ReviewDiffFileContentsResult,
    stream: false,
    scope: "filesystem:read",
  }),
} as const;
