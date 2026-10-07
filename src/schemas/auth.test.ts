import { describe, expect, it } from "vite-plus/test";

import { hasScope } from "../auth/scopes.ts";
import {
  AuthAdministrativeScopes,
  AuthClientSession,
  AuthCreatePairingCredentialInput,
  AuthEnvironmentScope,
  AuthGrantScope,
  AuthLegacyScopes,
  AuthPairingLink,
  AuthSessionState,
  AuthStandardClientScopes,
  ServerAuthDescriptor,
  grantedScopes,
} from "./auth.ts";

const authDescriptor = {
  policy: "loopback-browser",
  bootstrapMethods: ["one-time-token"],
  sessionMethods: ["bearer-access-token"],
  sessionCookieName: "session",
  futureField: true,
};

const granular = [
  "settings:write",
  "providers:manage",
  "environment:maintain",
  "preview:operate",
  "diagnostics:read",
  "terminal:read",
  "filesystem:read",
  "filesystem:write",
  "source-control:write",
] as const;

describe("auth scope vocabulary", () => {
  it("keeps the seventeen scopes strict for caller input", () => {
    expect(AuthEnvironmentScope.options).toHaveLength(17);
    for (const scope of granular)
      expect(AuthEnvironmentScope.safeParse(scope).success, scope).toBe(true);
    expect(AuthEnvironmentScope.safeParse("review:write").success).toBe(true);
    expect(AuthEnvironmentScope.safeParse("future:scope").success).toBe(false);
  });
  it("grants every scope but review:write", () => {
    expect(AuthGrantScope.options).toHaveLength(16);
    expect(AuthGrantScope.safeParse("review:write").success).toBe(false);
    expect(AuthGrantScope.safeParse("filesystem:write").success).toBe(true);
    expect(AuthCreatePairingCredentialInput.safeParse({ scopes: ["review:write"] }).success).toBe(
      false,
    );
    expect(AuthCreatePairingCredentialInput.safeParse({ scopes: ["future:scope"] }).success).toBe(
      false,
    );
    expect(AuthCreatePairingCredentialInput.parse({ scopes: [...granular] })).toEqual({
      scopes: [...granular],
    });
  });
  it("groups the standard, legacy, and administrative sets", () => {
    expect(AuthStandardClientScopes).toHaveLength(13);
    expect(AuthStandardClientScopes).toEqual(expect.arrayContaining([...granular, "relay:read"]));
    expect(AuthStandardClientScopes).not.toContain("access:read");
    expect(AuthLegacyScopes).toEqual(["access:read", "access:write", "relay:read", "relay:write"]);
    expect(AuthAdministrativeScopes).toHaveLength(16);
    expect(AuthAdministrativeScopes).not.toContain("review:write");
  });
  it("keeps descriptors loose and reads the optional server update scope", () => {
    expect(ServerAuthDescriptor.parse(authDescriptor)).toMatchObject({ futureField: true });
    expect(
      ServerAuthDescriptor.parse({ ...authDescriptor, serverUpdateScope: "environment:maintain" })
        .serverUpdateScope,
    ).toBe("environment:maintain");
    expect(
      ServerAuthDescriptor.safeParse({ ...authDescriptor, serverUpdateScope: "other" }).success,
    ).toBe(false);
    expect(
      AuthSessionState.parse({ authenticated: false, auth: authDescriptor, futureField: true }),
    ).toMatchObject({ futureField: true });
  });
});

describe("permissions alongside scopes", () => {
  it("decodes both on session state and prefers permissions as the grant", () => {
    const state = AuthSessionState.parse({
      authenticated: true,
      auth: authDescriptor,
      scopes: ["orchestration:read", "future:scope"],
      permissions: ["orchestration:read", "filesystem:read", "future:scope"],
    });
    expect(state.scopes).toEqual(["orchestration:read", "future:scope"]);
    expect(state.permissions).toEqual(["orchestration:read", "filesystem:read", "future:scope"]);
    expect(grantedScopes(state)).toEqual(["orchestration:read", "filesystem:read", "future:scope"]);
    expect(hasScope(grantedScopes(state), "filesystem:read")).toBe(true);
    expect(hasScope(state.scopes, "filesystem:read")).toBe(false);
  });
  it("falls back to scopes, then to nothing", () => {
    expect(grantedScopes({ scopes: ["orchestration:read"] })).toEqual(["orchestration:read"]);
    expect(grantedScopes({ scopes: ["orchestration:read"], permissions: [] })).toEqual([]);
    expect(grantedScopes({})).toEqual([]);
  });
  it("decodes a scope this client does not know on pairing links and client sessions", () => {
    const link = AuthPairingLink.parse({
      id: "pairing-1",
      scopes: ["future:scope"],
      permissions: ["future:scope", "settings:write"],
      subject: "subject-1",
      createdAt: "2030-01-01T00:00:00.000Z",
      expiresAt: "2030-01-02T00:00:00.000Z",
    });
    expect(link.scopes).toEqual(["future:scope"]);
    expect(grantedScopes(link)).toEqual(["future:scope", "settings:write"]);

    const session = AuthClientSession.parse({
      sessionId: "session-1",
      subject: "subject-1",
      scopes: ["access:read", "future:scope"],
      method: "bearer-access-token",
      client: { deviceType: "bot" },
      issuedAt: "2030-01-01T00:00:00.000Z",
      expiresAt: "2030-01-02T00:00:00.000Z",
      lastConnectedAt: null,
      connected: false,
      current: true,
    });
    expect(session.scopes).toContain("future:scope");
    expect(session.permissions).toBeUndefined();
    expect(grantedScopes(session)).toEqual(["access:read", "future:scope"]);
  });
  it("requires scopes on pairing links and client sessions", () => {
    expect(
      AuthPairingLink.safeParse({
        id: "pairing-1",
        subject: "subject-1",
        createdAt: "2030-01-01T00:00:00.000Z",
        expiresAt: "2030-01-02T00:00:00.000Z",
      }).success,
    ).toBe(false);
  });
});
