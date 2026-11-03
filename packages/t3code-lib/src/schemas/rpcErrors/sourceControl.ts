/**
 * Tagged failures of the source control repository, sign-in, clone and agent
 * session RPC methods, mirroring the contracts' `sourceControl.ts` and `agentSessions.ts`.
 */
import { z } from "zod";
import { ProjectId, forwardCompatibleLiteral } from "../common.ts";
import { SourceControlProviderKind } from "../vcs.ts";
import { Defect, taggedError } from "./shared.ts";

export const SourceControlSignInError = taggedError("SourceControlSignInError", {
  provider: SourceControlProviderKind,
  host: z.string(),
  reason: forwardCompatibleLiteral([
    "unsupported",
    "not-started",
    "cancelled",
    "denied",
    "expired",
    "failed",
  ]),
  detail: z.string(),
  cause: Defect.optional(),
});
export const SourceControlRepositoryError = taggedError("SourceControlRepositoryError", {
  provider: SourceControlProviderKind,
  operation: z.string(),
  detail: z.string(),
  cause: Defect.optional(),
});
export const AgentSessionImportProjectNotFoundError = taggedError(
  "AgentSessionImportProjectNotFoundError",
  { projectId: ProjectId },
);
export const AgentSessionImportProjectChangedError = taggedError(
  "AgentSessionImportProjectChangedError",
  { projectId: ProjectId },
);
export const AgentSessionScanError = taggedError("AgentSessionScanError", {
  operation: forwardCompatibleLiteral(["read-settings", "read-projects"]),
  cause: Defect,
});

/** In the order `RpcErrorRecord` lists them. */
export const sourceControlRpcErrors = [
  SourceControlSignInError,
  SourceControlRepositoryError,
  AgentSessionImportProjectNotFoundError,
  AgentSessionImportProjectChangedError,
  AgentSessionScanError,
] as const;
