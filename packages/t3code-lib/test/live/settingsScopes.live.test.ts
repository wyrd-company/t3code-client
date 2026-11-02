// ---
// relationships:
//   verifies: library-wire
// ---
/** The scopes a settings update asks for, on an isolated stock server. */
import { afterAll, beforeAll, describe, expect, it } from "vite-plus/test";
import { T3AuthError, type T3Client } from "../../src/index.ts";
import { connect, connectWithScopes, hasLiveServer } from "./liveClient.ts";

describe.skipIf(!hasLiveServer)("settings scopes", () => {
  const owner = connect();
  let settingsWriter: T3Client;
  let providerManager: T3Client;
  beforeAll(async () => {
    settingsWriter = await connectWithScopes(owner, ["orchestration:read", "settings:write"]);
    providerManager = await connectWithScopes(owner, ["orchestration:read", "providers:manage"]);
  });
  afterAll(async () => {
    await settingsWriter.close();
    await providerManager.close();
    await owner.close();
  });
  const providerPatch = { usageLimitSources: { sample_scope: null } };
  const settingPatch = { branchNamePrefix: "sample" };

  it("takes each patch with the scope the server asks for", async () => {
    await expect(
      settingsWriter.rpc.call("server.updateSettings", { patch: settingPatch }),
    ).resolves.toBeDefined();
    await expect(
      providerManager.rpc.call("server.updateSettings", {
        patch: providerPatch,
      }),
    ).resolves.toBeDefined();
  });

  it("refuses locally what the server refuses", async () => {
    for (const [scoped, patch] of [
      [settingsWriter, providerPatch],
      [providerManager, settingPatch],
      [settingsWriter, { ...settingPatch, ...providerPatch }],
      [providerManager, { ...settingPatch, ...providerPatch }],
    ] as const) {
      await expect(scoped.rpc.call("server.updateSettings", { patch })).rejects.toBeInstanceOf(
        T3AuthError,
      );
      expect(
        await scoped.rpc.callRaw("server.updateSettings", { patch }).catch((e: unknown) => e),
      ).toMatchObject({ tag: "EnvironmentAuthorizationError" });
    }
  });
});
