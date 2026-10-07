import { describe, expect, it } from "vite-plus/test";

import { T3AuthError } from "../errors.ts";
import {
  AuthDiagnosticsReadScope,
  AuthEnvironmentMaintainScope,
  AuthFilesystemReadScope,
  AuthFilesystemWriteScope,
  AuthLegacyScopes,
  AuthPreviewOperateScope,
  AuthProvidersManageScope,
  AuthReviewWriteScope,
  AuthSettingsWriteScope,
  AuthSourceControlWriteScope,
  AuthStandardClientScopes,
  AuthTerminalReadScope,
  ensureScopes,
  grantedScopes,
  hasScope,
} from "./scopes.ts";

describe("scope helpers", () => {
  it("names the granular scopes", () => {
    expect([
      AuthSettingsWriteScope,
      AuthProvidersManageScope,
      AuthEnvironmentMaintainScope,
      AuthPreviewOperateScope,
      AuthDiagnosticsReadScope,
      AuthTerminalReadScope,
      AuthFilesystemReadScope,
      AuthFilesystemWriteScope,
      AuthSourceControlWriteScope,
    ]).toEqual([
      "settings:write",
      "providers:manage",
      "environment:maintain",
      "preview:operate",
      "diagnostics:read",
      "terminal:read",
      "filesystem:read",
      "filesystem:write",
      "source-control:write",
    ]);
    expect(AuthReviewWriteScope).toBe("review:write");
    expect(AuthStandardClientScopes).not.toContain(AuthReviewWriteScope);
    expect(AuthLegacyScopes).not.toContain(AuthFilesystemReadScope);
  });
  it("checks and requires scopes", () => {
    expect(hasScope(["orchestration:read"], "orchestration:read")).toBe(true);
    expect(hasScope(["orchestration:read", "future:scope"], "filesystem:read")).toBe(false);
    expect(hasScope(undefined, "orchestration:read")).toBe(false);
    expect(() => ensureScopes(["orchestration:read"], ["access:write"])).toThrow(T3AuthError);
    expect(() =>
      ensureScopes(["orchestration:operate"], ["filesystem:write"], "writeFile"),
    ).toThrow("writeFile needs the filesystem:write scope.");
    expect(() =>
      ensureScopes(["filesystem:read", "filesystem:write"], ["filesystem:write"]),
    ).not.toThrow();
  });
  it("checks against the whole grant the server reported", () => {
    const granted = grantedScopes({
      scopes: ["relay:read"],
      permissions: ["relay:read", "source-control:write"],
    });
    expect(() => ensureScopes(granted, ["source-control:write"])).not.toThrow();
    expect(() => ensureScopes(granted, ["terminal:read"])).toThrow(T3AuthError);
  });
});
