// ---
// relationships:
//   implements: library
// ---
import { T3AuthError } from "../errors.ts";
import type { AuthEnvironmentScope, AuthGrantedScope } from "../schemas/auth.ts";

export {
  AuthAdministrativeScopes,
  AuthLegacyScopes,
  AuthStandardClientScopes,
  grantedScopes,
} from "../schemas/auth.ts";

export const AuthOrchestrationReadScope = "orchestration:read" as const;
export const AuthOrchestrationOperateScope = "orchestration:operate" as const;
export const AuthSettingsWriteScope = "settings:write" as const;
export const AuthProvidersManageScope = "providers:manage" as const;
export const AuthEnvironmentMaintainScope = "environment:maintain" as const;
export const AuthPreviewOperateScope = "preview:operate" as const;
export const AuthDiagnosticsReadScope = "diagnostics:read" as const;
export const AuthTerminalReadScope = "terminal:read" as const;
export const AuthTerminalOperateScope = "terminal:operate" as const;
export const AuthFilesystemReadScope = "filesystem:read" as const;
export const AuthFilesystemWriteScope = "filesystem:write" as const;
export const AuthSourceControlWriteScope = "source-control:write" as const;
/** Retained for decoding existing credentials; grants no current RPC access. */
export const AuthReviewWriteScope = "review:write" as const;
export const AuthAccessReadScope = "access:read" as const;
export const AuthAccessWriteScope = "access:write" as const;
export const AuthRelayReadScope = "relay:read" as const;
export const AuthRelayWriteScope = "relay:write" as const;

/** `granted` is what the server reported and may hold scopes this client does not know. */
export function hasScope(
  granted: readonly AuthGrantedScope[] | undefined,
  required: AuthEnvironmentScope,
): boolean {
  return granted?.includes(required) ?? false;
}

/** Require every named scope; throw T3AuthError for the first missing scope. */
export function ensureScopes(
  granted: readonly AuthGrantedScope[] | undefined,
  required: readonly AuthEnvironmentScope[],
  context = "operation",
): void {
  for (const scope of required) {
    if (!hasScope(granted, scope)) throw T3AuthError.insufficientScope(scope, context);
  }
}
