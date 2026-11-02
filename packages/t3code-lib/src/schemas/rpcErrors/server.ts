/** Tagged failures of the auth and server RPC methods, mirroring the contracts' `auth.ts`, `keybindings.ts`, `settings.ts` and `providerSetup.ts`. */
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
  "read-file",
  "read-provider-history",
  "read-project-settings",
  "read-secret",
  "remove-secret",
  "remove-stale-secret",
  "write-secret",
  "write-file",
  "prepare-directory",
]);
export const ServerSettingsError = taggedError("ServerSettingsError", {
  settingsPath: z.string(),
  operation: ServerSettingsOperation,
  providerInstanceId: z.string().optional(),
  environmentVariable: z.string().optional(),
  cause: Defect,
});
export const ProviderSetupError = taggedError("ProviderSetupError", {
  instanceId: z.string(),
  operation: z.string(),
  detail: z.string(),
  cause: Defect.optional(),
});
export const ServerNpmReleaseError = taggedError("ServerNpmReleaseError", {
  reason: z.string(),
});
export const ServerPrepareTriageError = taggedError("ServerPrepareTriageError", {
  cause: Defect.optional(),
});
