/** Tagged failures of the auth and server RPC methods, mirroring the contracts' `auth.ts`, `keybindings.ts`, `settings.ts`, `server.ts`, `secretRequest.ts`, `providerSetup.ts`, `acpRegistry.ts` and `relayClient.ts`. */
import { z } from "zod";
import { AcpRegistryProbeAuthMethod, AcpRegistryUrlAuthAction } from "../acpRegistry.ts";
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
  "write-managed-setting",
  "use-disallowed-provider",
]);
export const ServerSettingsError = taggedError("ServerSettingsError", {
  settingsPath: z.string(),
  operation: ServerSettingsOperation,
  providerInstanceId: z.string().optional(),
  environmentVariable: z.string().optional(),
  /** For `write-managed-setting`: the locked dot path. */
  managedSetting: z.string().optional(),
  /** For both policy operations: the organization that manages the setting or provider. */
  managedBy: z.string().optional(),
  /** For `use-disallowed-provider`: the provider's name as users know it. */
  providerLabel: z.string().optional(),
  cause: Defect.optional(),
});
export const ProviderSetupError = taggedError("ProviderSetupError", {
  instanceId: z.string(),
  operation: z.string(),
  detail: z.string(),
  cause: Defect.optional(),
});
export const AcpRegistryOperationError = taggedError("AcpRegistryOperationError", {
  reason: forwardCompatibleLiteral([
    "agent_not_configured",
    "agent_not_found",
    "archive_invalid",
    "authentication_failed",
    "checksum_mismatch",
    "download_failed",
    "install_failed",
    "instance_not_found",
    "logout_unsupported",
    "logout_failed",
    "probe_failed",
    "project_not_found",
    "registry_unavailable",
    "runner_unavailable",
    "session_import_failed",
    "session_delete_unsupported",
    "session_delete_failed",
    "session_list_unsupported",
    "session_resume_unsupported",
    "providers_unsupported",
    "providers_list_failed",
    "provider_configuration_failed",
    "unsupported_distribution",
    "unsupported_platform",
  ]),
  message: z.string(),
  authMethods: z.array(AcpRegistryProbeAuthMethod).optional(),
  authAction: AcpRegistryUrlAuthAction.optional(),
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
/** `reason` is a sentence for the user, such as the offline command to run instead. */
export const DatabaseReclaimError = taggedError("DatabaseReclaimError", { reason: z.string() });
/** A text generator API refused, was unreachable, or is not configured. */
export const TextGeneratorError = taggedError("TextGeneratorError", { detail: z.string() });
export const ServerSelfUpdateError = taggedError("ServerSelfUpdateError", {
  reason: z.string(),
  cause: Defect.optional(),
});
export const RelayClientInstallFailedError = taggedError("RelayClientInstallFailedError", {
  reason: forwardCompatibleLiteral([
    "download_failed",
    "invalid_checksum",
    "install_locked",
    "managed_by_policy",
    "override_missing",
    "unsupported_platform",
    "validation_failed",
    "write_failed",
  ]),
  message: z.string(),
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
