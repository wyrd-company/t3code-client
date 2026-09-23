/**
 * Tagged failures of the VCS RPC methods, mirroring the contracts'
 * `git.ts` and `sourceControl.ts`.
 */
import { z } from "zod";
import { PositiveInt, TrimmedNonEmptyString } from "../common.ts";
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
