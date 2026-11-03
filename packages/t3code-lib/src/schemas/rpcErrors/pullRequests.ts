/**
 * Tagged failures of the pull request methods, mirroring the contracts' `pullRequest.ts`.
 * The diff route sends the same bodies.
 */
import { z } from "zod";
import { TrimmedNonEmptyString, forwardCompatibleLiteral } from "../common.ts";
import { SourceControlProviderKind } from "../vcs.ts";
import { Defect, taggedError } from "./shared.ts";

export const PullRequestUnavailableError = taggedError("PullRequestUnavailableError", {
  /** `cli-*` names also apply to a host read with a credential: no credential, or a refused one. */
  reason: forwardCompatibleLiteral(["cli-missing", "cli-unauthenticated", "provider-unsupported"]),
  provider: SourceControlProviderKind.optional(),
  /** What the host needs on the server, in its own words. */
  requirement: TrimmedNonEmptyString.optional(),
  cause: Defect.optional(),
});
export const PullRequestOperationError = taggedError("PullRequestOperationError", {
  operation: z.string(),
  detail: TrimmedNonEmptyString,
  reason: forwardCompatibleLiteral(["not-found"]).optional(),
  cause: Defect.optional(),
});

/** In the order `RpcErrorRecord` lists them. */
export const pullRequestRpcErrors = [
  PullRequestUnavailableError,
  PullRequestOperationError,
] as const;
