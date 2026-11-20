// ---
// relationships:
//   verifies: library
// ---
import { describe, expect, it } from "vite-plus/test";
import { rpcMethods } from "../rpc/registry.ts";
import {
  ExecutionEnvironmentCapabilities,
  ServerInstallation,
  isT3LauncherInstallation,
} from "./environment.ts";
import {
  ServerProvider,
  ServerProviderUsageLimits,
  ServerProviderWorkspaceSnapshot,
} from "./provider.ts";
import { ServerProviderDelta, applyServerProviderDeltas } from "./providerDelta.ts";
import {
  EnvironmentTheme,
  ServerConfigStreamEvent,
  ServerSettings,
  UsageLimitSourceSnapshot,
} from "./server.ts";
import { SecretSourceCheckInput, SecretSourceCheckResult } from "./serverActions.ts";
import { ServerSelfUpdateInput } from "./serverSelfUpdate.ts";
import { ServerSettingsPatch } from "./settingsPatch.ts";

const at = "2026-01-01T00:00:00.000Z";
const model = { slug: "sample-model", name: "Sample", isCustom: false, capabilities: null };
const provider = {
  instanceId: "sample",
  driver: "codex",
  enabled: true,
  installed: true,
  version: "1.0.0",
  status: "ready",
  auth: { status: "authenticated", endpoint: "https://models.invalid" },
  checkedAt: at,
  models: [model],
  slashCommands: [{ name: "review" }],
  skills: [],
};

function rejects(schema: { safeParse(value: unknown): { success: boolean } }, value: unknown) {
  expect(schema.safeParse(value).success).toBe(false);
}

describe("server field changes of 0.1.10", () => {
  it("reads provider endpoints, text generation support, workspace models and catalog digests", () => {
    const read = ServerProvider.parse({
      ...provider,
      models: [{ ...model, supportsTextGeneration: false }],
      workspaceRescannedAt: at,
      catalogDigest: "digest-1",
    });
    expect(read).toMatchObject({
      auth: { endpoint: "https://models.invalid" },
      models: [{ supportsTextGeneration: false }],
      workspaceRescannedAt: at,
      catalogDigest: "digest-1",
    });
    rejects(ServerProvider, { ...provider, catalogDigest: " " });
    rejects(ServerProvider, { ...provider, auth: { status: "authenticated", endpoint: 1 } });
    const snapshot = ServerProviderWorkspaceSnapshot.parse({
      cwd: "/srv/sample",
      checkedAt: at,
      slashCommands: [],
      skills: [],
      models: [model],
      modelsPending: true,
    });
    expect(snapshot).toMatchObject({ models: [model], modelsPending: true });
    rejects(ServerProviderWorkspaceSnapshot, { ...snapshot, models: [{ slug: "x" }] });
  });

  it("reads usage windows scoped to models and a zero spend cap", () => {
    const limits = ServerProviderUsageLimits.parse({
      checkedAt: at,
      zeroSpendCap: true,
      windows: [
        {
          id: "weekly",
          kind: "weekly",
          label: "Weekly",
          usedPercent: 10,
          modelIds: ["sample-model"],
          providerIds: ["sample"],
        },
      ],
    });
    expect(limits).toMatchObject({ zeroSpendCap: true, windows: [{ modelIds: ["sample-model"] }] });
    rejects(ServerProviderUsageLimits, { checkedAt: at, windows: [], zeroSpendCap: "yes" });
    const source = { id: "hub", kind: "cliproxy", label: "Hub", checkedAt: at, accounts: [] };
    expect(
      UsageLimitSourceSnapshot.parse({
        ...source,
        origin: "https://hub.invalid",
        endpoint: "https://hub.invalid/base",
      }),
    ).toMatchObject({ origin: "https://hub.invalid", endpoint: "https://hub.invalid/base" });
    rejects(UsageLimitSourceSnapshot, { ...source, origin: " " });
  });

  it("rebuilds the provider list from deltas, and drops a provider it cannot rebuild", () => {
    const held = [ServerProvider.parse(provider)];
    const { models: _models, slashCommands: _commands, ...unchangedLists } = provider;
    const delta = ServerProviderDelta.parse({ ...unchangedLists, version: "1.1.0" });
    expect(delta).not.toHaveProperty("slashCommands");
    expect(delta).not.toHaveProperty("models");
    expect(applyServerProviderDeltas(held, [delta])).toEqual([{ ...held[0], version: "1.1.0" }]);
    const unknown = ServerProviderDelta.parse({ ...unchangedLists, instanceId: "other" });
    expect(applyServerProviderDeltas(held, [unknown])).toEqual([]);
    const event = ServerConfigStreamEvent.parse({
      version: 1,
      type: "providerStatusDeltas",
      payload: { providers: [delta] },
    });
    expect(event).toMatchObject({ type: "providerStatusDeltas", payload: { providers: [delta] } });
  });

  it("reads theme styles, a background revision, the host name and clock", () => {
    const theme = { id: "theme-1", name: "Sample", appearance: "dark" };
    expect(EnvironmentTheme.parse({ ...theme, css: "a{}", background: "rev-1" })).toMatchObject({
      css: "a{}",
      background: "rev-1",
    });
    rejects(EnvironmentTheme, { ...theme, css: "x".repeat(50_001) });
    const snapshot = ServerConfigStreamEvent.safeParse({
      version: 1,
      type: "snapshot",
      config: { hostname: 1 },
    });
    expect(snapshot.success).toBe(false);
  });

  it("reads the new capabilities and a launcher installation", () => {
    const flags = {
      secretSourceCheck: true,
      serverUpdateStaging: true,
      ignoredFileSearch: true,
      shellThreadFamilies: true,
      shellOlderSettled: true,
      linkedThreadRefreshes: true,
    };
    expect(ExecutionEnvironmentCapabilities.parse(flags)).toMatchObject(flags);
    for (const key of Object.keys(flags)) {
      rejects(ExecutionEnvironmentCapabilities, { [key]: "yes" });
    }
  });

  it("requires both paths of a launcher installation and keeps other kinds as they were", () => {
    const installation = { kind: "t3-launcher", launcher: "/opt/t3/bin/t3 ", baseDir: "/opt/t3" };
    const parsed = ServerInstallation.parse(installation);
    expect(parsed).toEqual(installation);
    expect(isT3LauncherInstallation(parsed) && parsed.baseDir).toBe("/opt/t3");
    rejects(ServerInstallation, { ...installation, baseDir: "" });
    const { launcher: _launcher, ...withoutLauncher } = installation;
    const { baseDir: _baseDir, ...withoutBaseDir } = installation;
    rejects(ServerInstallation, withoutLauncher);
    rejects(ServerInstallation, withoutBaseDir);
    rejects(ServerInstallation, { kind: "t3-launcher" });
    // A malformed launcher install reads as no installation, not as a failed descriptor.
    expect(
      ExecutionEnvironmentCapabilities.parse({ serverInstallation: withoutBaseDir }),
    ).not.toHaveProperty("serverInstallation", expect.anything());
    const npm = { kind: "npm-global", prefix: "/usr/local" };
    expect(ServerInstallation.parse(npm)).toEqual(npm);
    expect(isT3LauncherInstallation(ServerInstallation.parse(npm))).toBe(false);
    expect(ServerInstallation.parse({ kind: "npx" })).toEqual({ kind: "npx" });
    expect(ServerInstallation.parse({ kind: "sample-future" })).toEqual({ kind: "sample-future" });
  });

  it("stages an update, checks a secret source and sends the new settings keys", () => {
    expect(ServerSelfUpdateInput.parse({ targetVersion: "1.2.3", stageOnly: true })).toEqual({
      targetVersion: "1.2.3",
      stageOnly: true,
    });
    rejects(ServerSelfUpdateInput, { targetVersion: "1.2.3", stageOnly: "yes" });
    expect(
      SecretSourceCheckInput.parse({ source: { provider: "vault", reference: "sample/key" } }),
    ).toEqual({ source: { provider: "vault", reference: "sample/key" } });
    rejects(SecretSourceCheckInput, { source: { provider: "vault" } });
    expect(SecretSourceCheckResult.parse({ _tag: "Resolved" })).toEqual({ _tag: "Resolved" });
    expect(SecretSourceCheckResult.parse({ _tag: "Failed", detail: "Locked." })).toEqual({
      _tag: "Failed",
      detail: "Locked.",
    });
    expect(SecretSourceCheckResult.parse({ _tag: "Pending" })).toMatchObject({ unknown: true });
    const patch = {
      keepAwakeWhileAgentsWork: false,
      requireConnectDeviceApproval: true,
      offeredSourceControlProviders: { gitlab: true },
      pullRequestMergeMethod: "fast-forward",
    };
    expect(ServerSettingsPatch.parse(patch)).toEqual(patch);
    for (const [key, value] of Object.entries(patch)) {
      rejects(ServerSettingsPatch, { [key]: typeof value === "boolean" ? "yes" : 1 });
    }
  });

  it("reads the new settings", () => {
    const settings = {
      keepAwakeWhileAgentsWork: true,
      requireConnectDeviceApproval: false,
      defaultAppearance: "dark",
      defaultAppearanceSetAt: "2026-01-01T00:00:00.000Z",
      offeredSourceControlProviders: { gitlab: true },
    };
    expect(ServerSettings.parse(settings)).toEqual(settings);
    for (const key of Object.keys(settings)) rejects(ServerSettings, { [key]: 1 });
  });

  it("registers the new methods with their scopes", () => {
    expect(rpcMethods["server.getSettings"]).toMatchObject({
      stream: false,
      scope: "orchestration:read",
    });
    expect(rpcMethods["server.checkSecretSource"]).toMatchObject({ scope: "settings:write" });
    expect(rpcMethods["pullRequests.subscribeLinkedThreadRefreshes"]).toMatchObject({
      stream: true,
      scope: "orchestration:read",
    });
    const refresh = rpcMethods["server.refreshProviders"].payload;
    expect(refresh.parse({ omitProviders: true, machineCatalog: true })).toEqual({
      omitProviders: true,
      machineCatalog: true,
    });
    rejects(refresh, { omitProviders: "yes" });
    const subscribe = rpcMethods.subscribeServerConfig.payload;
    expect(subscribe.parse({ providerCatalogDigests: true, providerStatusDeltas: true })).toEqual({
      providerCatalogDigests: true,
      providerStatusDeltas: true,
    });
    rejects(subscribe, { providerStatusDeltas: 1 });
  });
});
