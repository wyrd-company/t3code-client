/**
 * Tagged failures of the VCS RPC methods, mirroring the contracts'
 * `git.ts`, `sourceControl.ts` and `vcs.ts`.
 */
import { z } from "zod";
import {
  NonNegativeInt,
  PositiveInt,
  TrimmedNonEmptyString,
  forwardCompatibleLiteral,
} from "../common.ts";
import { SourceControlProviderKind } from "../vcs.ts";
import { Defect, taggedError } from "./shared.ts";

export const GitCommandError = taggedError("GitCommandError", {
  operation: z.string(),
  command: z.string(),
  cwd: z.string(),
  argumentCount: z.number().optional(),
  exitCode: z.number().optional(),
  stdoutLength: z.number().optional(),
  stderrLength: z.number().optional(),
  outputLength: z.number().optional(),
  reason: forwardCompatibleLiteral([
    "authentication_failed",
    "branch_already_exists",
    "branch_checked_out_in_worktree",
    "config_locked",
    "host_key_unverified",
    "not_a_repository",
    "path_already_exists",
    "push_rejected_by_remote",
    "push_rejected_non_fast_forward",
    "ref_not_found",
    "remote_unreachable",
    "tag_would_be_clobbered",
  ]).optional(),
  detail: z.string(),
  cause: Defect.optional(),
});
export const GitManagerError = taggedError("GitManagerError", {
  operation: z.string(),
  cwd: z.string(),
  detail: z.string(),
  cause: Defect.optional(),
});
export const GitPullRequestMaterializationError = taggedError(
  "GitPullRequestMaterializationError",
  {
    cwd: TrimmedNonEmptyString,
    pullRequestNumber: PositiveInt,
    headRepository: TrimmedNonEmptyString.nullable(),
    headBranch: TrimmedNonEmptyString,
    localBranch: TrimmedNonEmptyString,
    cause: Defect,
  },
);
export const SourceControlProviderError = taggedError("SourceControlProviderError", {
  provider: SourceControlProviderKind,
  operation: z.string(),
  cwd: z.string(),
  command: z.string().optional(),
  repository: z.string().optional(),
  reference: z.string().optional(),
  detail: z.string(),
  cause: Defect.optional(),
});
export const TextGenerationError = taggedError("TextGenerationError", {
  operation: z.string(),
  detail: z.string(),
  cause: Defect.optional(),
});

const vcsProcess = {
  operation: z.string(),
  command: z.string(),
  cwd: z.string(),
  argumentCount: NonNegativeInt.optional(),
};
export const VcsProcessSpawnError = taggedError("VcsProcessSpawnError", {
  ...vcsProcess,
  cause: Defect,
});
export const VcsProcessExitError = taggedError("VcsProcessExitError", {
  ...vcsProcess,
  exitCode: z.number(),
  detail: z.string(),
  failureKind: forwardCompatibleLiteral([
    "authentication",
    "not-found",
    "rate-limited",
    "command-failed",
  ]).optional(),
  retryable: z.boolean().optional(),
  stderrLength: NonNegativeInt.optional(),
  stderrTruncated: z.boolean().optional(),
});
export const VcsProcessTimeoutError = taggedError("VcsProcessTimeoutError", {
  ...vcsProcess,
  timeoutMs: z.number(),
});
export const VcsProcessStdinWriteError = taggedError("VcsProcessStdinWriteError", {
  ...vcsProcess,
  stdinBytes: NonNegativeInt,
  cause: Defect,
});
export const VcsProcessOutputReadError = taggedError("VcsProcessOutputReadError", {
  ...vcsProcess,
  stream: forwardCompatibleLiteral(["stdout", "stderr", "exitCode"]),
  cause: Defect,
});
export const VcsProcessOutputLimitError = taggedError("VcsProcessOutputLimitError", {
  ...vcsProcess,
  stream: forwardCompatibleLiteral(["stdout", "stderr"]),
  maxBytes: NonNegativeInt,
  observedBytes: NonNegativeInt,
});
export const VcsProcessMissingExitCodeError = taggedError(
  "VcsProcessMissingExitCodeError",
  vcsProcess,
);
export const VcsRepositoryDetectionError = taggedError("VcsRepositoryDetectionError", {
  operation: z.string(),
  cwd: z.string(),
  detail: z.string(),
  cause: Defect.optional(),
});
export const VcsUnsupportedOperationError = taggedError("VcsUnsupportedOperationError", {
  operation: z.string(),
  kind: forwardCompatibleLiteral(["git", "jj", "unknown"]),
  detail: z.string(),
});

/** The failures of the contracts' `VcsError`, in the order `RpcErrorRecord` lists them. */
export const vcsRpcErrors = [
  VcsProcessSpawnError,
  VcsProcessExitError,
  VcsProcessTimeoutError,
  VcsProcessStdinWriteError,
  VcsProcessOutputReadError,
  VcsProcessOutputLimitError,
  VcsProcessMissingExitCodeError,
  VcsRepositoryDetectionError,
  VcsUnsupportedOperationError,
] as const;
