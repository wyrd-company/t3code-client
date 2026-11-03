// ---
// relationships:
//   implements: library
// ---
import { z } from "zod";

import {
  AuthSessionId,
  ClientSurface,
  ClientWebDeployment,
  IsoDateTime,
  TrimmedNonEmptyString,
  forwardCompatibleLiteral,
  type KnownOr,
} from "./common.ts";

export const ServerAuthPolicy = z.enum([
  "desktop-managed-local",
  "loopback-browser",
  "remote-reachable",
  "unsafe-no-auth",
]);
export type ServerAuthPolicy = z.infer<typeof ServerAuthPolicy>;

export const ServerAuthBootstrapMethod = z.enum(["desktop-bootstrap", "one-time-token"]);
export type ServerAuthBootstrapMethod = z.infer<typeof ServerAuthBootstrapMethod>;

export const ServerAuthSessionMethod = z.enum([
  "browser-session-cookie",
  "bearer-access-token",
  "dpop-access-token",
]);
export type ServerAuthSessionMethod = z.infer<typeof ServerAuthSessionMethod>;

const authEnvironmentScopes = [
  "orchestration:read",
  "orchestration:operate",
  "settings:write",
  "providers:manage",
  "environment:maintain",
  "preview:operate",
  "diagnostics:read",
  "terminal:read",
  "terminal:operate",
  "filesystem:read",
  "filesystem:write",
  "review:write",
  "source-control:write",
  "access:read",
  "access:write",
  "relay:read",
  "relay:write",
] as const;

/** Strict: validates the scopes a caller asks for. */
export const AuthEnvironmentScope = z.enum(authEnvironmentScopes);
export type AuthEnvironmentScope = z.infer<typeof AuthEnvironmentScope>;

/** What a pairing credential may be granted: every scope but `review:write`, which grants nothing. */
export const AuthGrantScope = z.enum(authEnvironmentScopes.filter((s) => s !== "review:write"));
export type AuthGrantScope = z.infer<typeof AuthGrantScope>;

/**
 * A scope as the server reports it (session state, token exchange, pairing
 * links, client sessions). The strict enum above validates what a caller
 * asks for; a newer server may grant a scope this client has not heard of,
 * and that must decode rather than fail.
 */
export const AuthGrantedScope = forwardCompatibleLiteral(authEnvironmentScopes);
export type AuthGrantedScope = KnownOr<AuthEnvironmentScope>;

const authMcpClientAccessLevels = [
  "read-only",
  "approval-required",
  "auto-accept-edits",
  "auto",
  "full-access",
] as const;

/** Strict: validates the access a caller asks for. */
export const AuthMcpClientAccess = z.enum(authMcpClientAccessLevels);
export type AuthMcpClientAccess = z.infer<typeof AuthMcpClientAccess>;

/** An access level as the server reports it; a newer level must decode. */
export const AuthMcpClientGrantedAccess = forwardCompatibleLiteral(authMcpClientAccessLevels);
export type AuthMcpClientGrantedAccess = KnownOr<AuthMcpClientAccess>;

export const AuthStandardClientScopes = [
  "orchestration:read",
  "orchestration:operate",
  "settings:write",
  "providers:manage",
  "environment:maintain",
  "preview:operate",
  "diagnostics:read",
  "terminal:read",
  "terminal:operate",
  "source-control:write",
  "filesystem:read",
  "filesystem:write",
  "relay:read",
  "access:read",
  "access:write",
  "relay:write",
] as const satisfies readonly AuthEnvironmentScope[];

/**
 * The scopes clients released before granular permissions knew. Servers
 * report `scopes` filtered to these and the full grant as `permissions`.
 */
export const AuthLegacyScopes = [
  "orchestration:read",
  "orchestration:operate",
  "terminal:operate",
  "review:write",
  "access:read",
  "access:write",
  "relay:read",
  "relay:write",
] as const satisfies readonly AuthEnvironmentScope[];

export const ServerAuthDescriptor = z.looseObject({
  policy: ServerAuthPolicy,
  bootstrapMethods: z.array(ServerAuthBootstrapMethod),
  sessionMethods: z.array(ServerAuthSessionMethod),
  sessionCookieName: TrimmedNonEmptyString,
  /** Older servers omit this and authorize self-updates with orchestration:operate. */
  serverUpdateScope: z.literal("environment:maintain").optional(),
});
export type ServerAuthDescriptor = z.infer<typeof ServerAuthDescriptor>;

/**
 * `scopes` holds only the legacy vocabulary; `permissions` is the whole grant.
 * `grantedScopes` reads the grant from whichever the server sent.
 */
const authScopeResponseFields = {
  scopes: z.array(AuthGrantedScope),
  permissions: z.array(AuthGrantedScope).optional(),
} as const;

/** Read granular permissions when present, otherwise the legacy scopes. */
export function grantedScopes(response: {
  readonly scopes?: readonly AuthGrantedScope[] | undefined;
  readonly permissions?: readonly AuthGrantedScope[] | undefined;
}): AuthGrantedScope[] {
  return [...(response.permissions ?? response.scopes ?? [])];
}

export const AuthSessionState = z.looseObject({
  authenticated: z.boolean(),
  auth: ServerAuthDescriptor,
  scopes: z.array(AuthGrantedScope).optional(),
  permissions: z.array(AuthGrantedScope).optional(),
  sessionMethod: ServerAuthSessionMethod.optional(),
  expiresAt: IsoDateTime.optional(),
});
export type AuthSessionState = z.infer<typeof AuthSessionState>;

export const AuthAccessTokenResult = z.looseObject({
  access_token: TrimmedNonEmptyString,
  issued_token_type: z.literal("urn:ietf:params:oauth:token-type:access_token"),
  token_type: z.enum(["Bearer", "DPoP"]),
  expires_in: z.number(),
  scope: TrimmedNonEmptyString,
});
export type AuthAccessTokenResult = z.infer<typeof AuthAccessTokenResult>;

export const AuthWebSocketTicketResult = z.looseObject({
  ticket: TrimmedNonEmptyString,
  expiresAt: IsoDateTime,
});
export type AuthWebSocketTicketResult = z.infer<typeof AuthWebSocketTicketResult>;

/** A ticket minted for one use is refused on the other route. */
export const AuthWebSocketTicketUse = z.enum(["rpc", "media"]);
export type AuthWebSocketTicketUse = z.infer<typeof AuthWebSocketTicketUse>;

export const AuthBrowserSessionRequest = z.looseObject({ credential: TrimmedNonEmptyString });
export type AuthBrowserSessionRequest = z.infer<typeof AuthBrowserSessionRequest>;

/** The session token itself is only in the response's HttpOnly cookie. */
export const AuthBrowserSessionResult = z.looseObject({
  authenticated: z.literal(true),
  ...authScopeResponseFields,
  sessionMethod: ServerAuthSessionMethod,
  expiresAt: IsoDateTime,
});
export type AuthBrowserSessionResult = z.infer<typeof AuthBrowserSessionResult>;

export const AuthRevokePairingLinkInput = z.looseObject({ id: TrimmedNonEmptyString });
export type AuthRevokePairingLinkInput = z.infer<typeof AuthRevokePairingLinkInput>;

export const AuthRevokeClientSessionInput = z.looseObject({ sessionId: AuthSessionId });
export type AuthRevokeClientSessionInput = z.infer<typeof AuthRevokeClientSessionInput>;

export const AuthRevokeResult = z.looseObject({ revoked: z.boolean() });
export type AuthRevokeResult = z.infer<typeof AuthRevokeResult>;

export const AuthOtherClientSessionsRevokeResult = z.looseObject({ revokedCount: z.number() });
export type AuthOtherClientSessionsRevokeResult = z.infer<
  typeof AuthOtherClientSessionsRevokeResult
>;

/** The P-256 key that a proof-bound session signs with. `d` is the private part. */
export const DpopPrivateJwk = z.looseObject({
  kty: z.literal("EC"),
  crv: z.literal("P-256"),
  x: TrimmedNonEmptyString,
  y: TrimmedNonEmptyString,
  d: TrimmedNonEmptyString,
});
export type DpopPrivateJwk = z.infer<typeof DpopPrivateJwk>;

export const AuthPairingCredentialResult = z.looseObject({
  id: TrimmedNonEmptyString,
  credential: TrimmedNonEmptyString,
  label: TrimmedNonEmptyString.optional(),
  expiresAt: IsoDateTime,
});
export type AuthPairingCredentialResult = z.infer<typeof AuthPairingCredentialResult>;

export const AuthPairingLink = z.looseObject({
  id: TrimmedNonEmptyString,
  ...authScopeResponseFields,
  subject: TrimmedNonEmptyString,
  label: TrimmedNonEmptyString.optional(),
  createdAt: IsoDateTime,
  expiresAt: IsoDateTime,
});
export type AuthPairingLink = z.infer<typeof AuthPairingLink>;

export const AuthClientMetadataDeviceType = z.enum([
  "desktop",
  "mobile",
  "tablet",
  "bot",
  "unknown",
]);
export type AuthClientMetadataDeviceType = z.infer<typeof AuthClientMetadataDeviceType>;

/** The form body of `POST /oauth/token`. */
export const AuthTokenExchangeRequest = z.looseObject({
  grant_type: z.literal("urn:ietf:params:oauth:grant-type:token-exchange"),
  subject_token: TrimmedNonEmptyString,
  subject_token_type: z.literal("urn:t3:params:oauth:token-type:environment-bootstrap"),
  requested_token_type: z.literal("urn:ietf:params:oauth:token-type:access_token"),
  scope: TrimmedNonEmptyString.optional(),
  client_label: TrimmedNonEmptyString.optional(),
  client_device_type: AuthClientMetadataDeviceType.optional(),
  client_os: TrimmedNonEmptyString.optional(),
});
export type AuthTokenExchangeRequest = z.infer<typeof AuthTokenExchangeRequest>;

export const AuthClientMetadata = z.looseObject({
  label: TrimmedNonEmptyString.optional(),
  ipAddress: TrimmedNonEmptyString.optional(),
  userAgent: TrimmedNonEmptyString.optional(),
  deviceType: AuthClientMetadataDeviceType,
  os: TrimmedNonEmptyString.optional(),
  browser: TrimmedNonEmptyString.optional(),
});
export type AuthClientMetadata = z.infer<typeof AuthClientMetadata>;

/** What a client says about itself, for example to name it in a triage session. */
export const AuthClientPresentationMetadata = z.looseObject({
  label: TrimmedNonEmptyString.optional(),
  deviceType: AuthClientMetadataDeviceType.optional(),
  os: TrimmedNonEmptyString.optional(),
  osMajorVersion: z.number().int().optional(),
  deviceModel: TrimmedNonEmptyString.optional(),
  surface: ClientSurface.optional(),
  webDeployment: ClientWebDeployment.optional(),
  browser: TrimmedNonEmptyString.optional(),
  appVersion: TrimmedNonEmptyString.optional(),
});
export type AuthClientPresentationMetadata = z.infer<typeof AuthClientPresentationMetadata>;

export const AuthClientSession = z.looseObject({
  sessionId: AuthSessionId,
  subject: TrimmedNonEmptyString,
  ...authScopeResponseFields,
  method: ServerAuthSessionMethod,
  client: AuthClientMetadata,
  issuedAt: IsoDateTime,
  expiresAt: IsoDateTime,
  lastConnectedAt: IsoDateTime.nullable(),
  connected: z.boolean(),
  current: z.boolean(),
});
export type AuthClientSession = z.infer<typeof AuthClientSession>;

export const AuthCreatePairingCredentialInput = z.looseObject({
  label: TrimmedNonEmptyString.optional(),
  scopes: z.array(AuthGrantScope).optional(),
});
export type AuthCreatePairingCredentialInput = z.infer<typeof AuthCreatePairingCredentialInput>;

export const ClientMetadataSurface = ClientSurface;
export type ClientMetadataSurface = z.infer<typeof ClientMetadataSurface>;
