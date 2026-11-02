/** Tagged failures of the auth and server RPC methods, mirroring the contracts' `auth.ts`, `keybindings.ts`, `settings.ts`, `server.ts`, `secretRequest.ts` and `providerSetup.ts`. */
import { z } from "zod";
import { AuthGrantedScope } from "../auth.ts";
import { forwardCompatibleLiteral } from "../common.ts";
import { Defect, taggedError } from "./shared.ts";

export const EnvironmentAuthorizationError = taggedError("EnvironmentAuthorizationError", {
  message: z.string(),
  requiredScope: AuthGrantedScope,
  requiredPermission: z.string().optional(),
});
export const AuthAccessStreamError = taggedError("AuthAccessStreamError", { message: z.string() });

/** The contracts class is `KeybindingsConfigError`; its wire tag is `KeybindingsConfigParseError`. */
export const KeybindingsConfigError = taggedError("KeybindingsConfigParseError", {
  configPath: z.string(),
  detail: z.string(),
  cause: Defect.optional(),
});
export const ServerSettingsOperation = forwardCompatibleLiteral([
  "normalize",
  "check-exists",
  "create-provider-instance",
  "read-file",
  "read-provider-history",
  "read-project-settings",
  "read-secret",
  "remove-secret",
  "remove-stale-secret",
  "write-secret",
  "write-secret-provider",
  "write-file",
  "prepare-directory",
]);
export const ServerSettingsError = taggedError("ServerSettingsError", {
  settingsPath: z.string(),
  operation: ServerSettingsOperation,
  providerInstanceId: z.string().optional(),
  environmentVariable: z.string().optional(),
  cause: Defect.optional(),
});
export const ProviderSetupError = taggedError("ProviderSetupError", {
  instanceId: z.string(),
  operation: z.string(),
  detail: z.string(),
  cause: Defect.optional(),
});
export const UsageLimitSourceError = taggedError("UsageLimitSourceError", {
  detail: z.string(),
});
export const ProviderUploadFeedbackError = taggedError("ProviderUploadFeedbackError", {
  threadId: z.string(),
  cause: Defect.optional(),
});
export const ServerNpmReleaseError = taggedError("ServerNpmReleaseError", {
  reason: z.string(),
});
export const ServerPrepareTriageError = taggedError("ServerPrepareTriageError", {
  cause: Defect.optional(),
});
export const ServerProviderUpdateError = taggedError("ServerProviderUpdateError", {
  provider: z.string(),
  reason: z.string(),
  cause: Defect.optional(),
});
export const SecretRequestFailureReason = forwardCompatibleLiteral([
  "load_failed",
  "not_found",
  "already_answered",
  "agent_stopped",
  "store_failed",
  "record_failed",
  "invalid_ref",
  "read_failed",
  "ref_unavailable",
  "ref_expired",
  "consume_failed",
  "not_a_file_request",
]);
export const SecretRequestError = taggedError("SecretRequestError", {
  reason: SecretRequestFailureReason,
  cause: Defect.optional(),
});
