/**
 * Tagged failures of the pull request methods, mirroring the contracts' `pullRequest.ts`.
 * The diff route sends the same bodies.
 */
import { z } from "zod";
import { TrimmedNonEmptyString, forwardCompatibleLiteral } from "../common.ts";
import { PullRequestListResult } from "../pullRequestList.ts";
import { SourceControlProviderKind } from "../vcs.ts";
import { Defect, taggedError } from "./shared.ts";

export const PullRequestUnavailableError = taggedError("PullRequestUnavailableError", {
  /** `cli-*` names also apply to a host read with a credential: no credential, or a refused one. */
  reason: forwardCompatibleLiteral([
    "cli-missing",
    "cli-unauthenticated",
    "provider-unsupported",
    "repository-without-project",
  ]),
  provider: SourceControlProviderKind.optional(),
  /** A list read whose hosts all failed: the entries are empty, the errors name the projects. */
  listResult: PullRequestListResult.optional(),
  /** What the host needs on the server, in its own words. */
  requirement: TrimmedNonEmptyString.optional(),
  /** For `repository-without-project`: the repository no project has. */
  repository: TrimmedNonEmptyString.optional(),
  /** For `repository-without-project` on a host read through any checkout: the host. */
  host: TrimmedNonEmptyString.optional(),
  cause: Defect.optional(),
});
export const PullRequestOperationError = taggedError("PullRequestOperationError", {
  operation: z.string(),
  detail: TrimmedNonEmptyString,
  reason: forwardCompatibleLiteral(["not-found"]).optional(),
  listResult: PullRequestListResult.optional(),
  cause: Defect.optional(),
});

/** In the order `RpcErrorRecord` lists them. */
export const pullRequestRpcErrors = [
  PullRequestUnavailableError,
  PullRequestOperationError,
] as const;
