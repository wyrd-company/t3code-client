// ---
// relationships:
//   verifies: library-wire
// ---
/**
 * The settings, keybinding, provider update, client activity, discovery and usage
 * rate methods on an isolated stock server. An update reaches only its refusal,
 * because a success runs the provider's installer on the host.
 */
import * as NodeFSP from "node:fs/promises";
import { WebSocket as WsWebSocket } from "ws";
import { afterAll, beforeAll, describe, expect, it } from "vite-plus/test";
import { T3AuthError, T3Client, schemas } from "../../src/index.ts";
import type { WebSocketConstructor } from "../../src/internal/websocket.ts";
import { ProviderDriverKind, ProviderInstanceId } from "../../src/schemas/common.ts";
import { isRpcErrorOfTag } from "../../src/schemas/rpcErrors.ts";
import { connect, hasLiveServer, modelSelection, refusal } from "./liveClient.ts";

const baseUrl = process.env["T3_LIVE_URL"];
const webSocket = WsWebSocket as unknown as WebSocketConstructor;

/** A value for each kind of nested setting, so that the server checks each schema's wire form. */
const everyShape: schemas.settingsPatch.ServerSettingsPatch = {
  setModelFavorites: [
    {
      provider: ProviderInstanceId.parse("codex"),
      model: "sample-model",
      favorite: true,
    },
  ],
  setModelsHidden: [
    {
      provider: ProviderInstanceId.parse("codex"),
      model: "sample-hidden",
      hidden: true,
    },
  ],
  setProviderModelOrder: {
    provider: ProviderInstanceId.parse("codex"),
    modelOrder: ["sample-model"],
  },
  worktreeCleanup: {
    mode: "custom",
    rules: { worktreeOnMerge: true, worktreeAfterDays: 30 },
  },
  storageCleanup: { logsAfterDays: 14, browserArtifactsAfterDays: null },
  responseStreamingMode: "paragraph",
  defaultRuntimeMode: "auto",
  defaultModelSelection: modelSelection,
  fallbackModelSelection: null,
  defaultThreadEnvMode: "worktree",
  worktreeSubmodules: "none",
  sidebarAutoSettleAfterDays: 1.5,
  idleCompaction: "off",
  snoozePresets: [
    { kind: "after", minutes: 30 },
    { kind: "at", day: "monday", time: "09:00" },
  ],
  backgroundActivity: {
    schemaVersion: 1,
    profile: "custom",
    baseProfile: "balanced",
    overrides: { automaticGitFetchInterval: 60_000, pauseWhenOnBattery: true },
  },
  environmentIcon: "server",
  textGenerationModelSelection: { model: "sample-model" },
  branchNamingMode: "semantic",
  sourceControlWritingStyle: { mode: "conventional_commits" },
  pullRequestMergeMethod: "rebase",
  observability: { otlpTracesUrl: "http://127.0.0.1:9/v1/traces" },
  deviceHosts: [
    {
      id: "sample-ssh",
      label: "Sample",
      target: "sample@host.invalid",
      port: 2222,
    },
  ],
  easDeviceHosts: [{ kind: "eas", id: "sample-eas", label: "Sample", idleMinutes: 5 }],
  simlockDeviceHosts: [
    {
      kind: "simlock",
      id: "sample-lock",
      label: "Sample",
      gatewayUrl: "http://host.invalid:4700",
    },
  ],
  usageLimitSources: {
    sample: { kind: "cliproxy", url: "http://host.invalid:9", enabled: false },
  },
  usagePriceOverrides: {
    "sample-model": {
      inputCostPerMillionTokens: 1,
      outputCostPerMillionTokens: 2,
    },
  },
  usageModelAliases: { "sample-alias": "sample-model" },
};

describe.skipIf(!hasLiveServer)("settings methods", () => {
  const client = connect();
  afterAll(() => client.close());

  it("writes each kind of setting and reads it back", async () => {
    const updated = await client.rpc.call("server.updateSettings", {
      patch: everyShape,
    });
    const read = await client.server.getSettings();
    for (const settings of [updated, read]) {
      expect(settings).toMatchObject({
        worktreeCleanup: { mode: "custom", rules: { worktreeOnMerge: true } },
        storageCleanup: { logsAfterDays: 14 },
        responseStreamingMode: "paragraph",
        snoozePresets: everyShape.snoozePresets,
        branchNamingMode: "semantic",
        pullRequestMergeMethod: "rebase",
        deviceHosts: [{ id: "sample-ssh", port: 2222 }],
        easDeviceHosts: [{ id: "sample-eas", idleMinutes: 5 }],
        simlockDeviceHosts: [{ id: "sample-lock" }],
        usageModelAliases: { "sample-alias": "sample-model" },
      });
    }
  });

  it("takes a project's override with whole cleanup rules", async () => {
    const { projectId } = await client.projects.createNew({ name: "Sample override" });
    const worktreeCleanup = {
      mode: "custom",
      rules: {
        worktreeAfterDays: 30,
        worktreeOnMerge: true,
        worktreeOnDelete: false,
        worktreeUnchanged: false,
      },
    } as const;
    const updated = await client.rpc.call("server.updateSettings", {
      patch: { projectSettingsOverrides: { [projectId]: { worktreeCleanup } } },
    });
    expect(updated).toMatchObject({
      projectSettingsOverrides: { [projectId]: { worktreeCleanup } },
    });
  });

  it("changes one provider instance and redacts a sensitive value", async () => {
    const instanceId = ProviderInstanceId.parse("sample_codex");
    const instance = {
      driver: ProviderDriverKind.parse("codex"),
      enabled: false,
      environment: [{ name: "SAMPLE_KEY", value: "sample-value", sensitive: true }],
    };
    const created = await client.rpc.call("server.updateSettings", {
      patch: {},
      providerInstanceMutation: { operation: "create", instanceId, instance },
    });
    expect(JSON.stringify(created)).not.toContain("sample-value");
    expect(created).toMatchObject({
      providerInstances: {
        sample_codex: {
          enabled: false,
          environment: [{ name: "SAMPLE_KEY", value: "", valueRedacted: true }],
        },
      },
    });
    const again = await refusal(
      client.rpc.call("server.updateSettings", {
        patch: {},
        providerInstanceMutation: { operation: "create", instanceId, instance },
      }),
    );
    expect(isRpcErrorOfTag(again, "ServerSettingsError")).toBe(true);
    const removed = await client.rpc.call("server.updateSettings", {
      patch: {},
      providerInstanceMutation: { operation: "remove", instanceId },
    });
    expect(removed).not.toMatchObject({
      providerInstances: { sample_codex: {} },
    });
  });

  it("adds, replaces and removes a keybinding", async () => {
    const shortcuts = (result: schemas.serverActions.ServerKeybindingsResult) =>
      result.keybindings.filter((rule) => rule.command === "usage.open");
    const key = "mod+shift+f9";
    const added = await client.rpc.call("server.upsertKeybinding", {
      key,
      command: "usage.open",
    });
    expect(shortcuts(added)).toContainEqual(
      expect.objectContaining({
        shortcut: expect.objectContaining({ key: "f9" }),
      }),
    );
    const replaced = await client.rpc.call("server.upsertKeybinding", {
      key: "mod+shift+f10",
      command: "usage.open",
      when: "terminalFocus",
      replace: { key, command: "usage.open" },
    });
    const keys = shortcuts(replaced).map((rule) => rule.shortcut.key);
    expect(keys).toContain("f10");
    expect(keys).not.toContain("f9");
    expect(shortcuts(replaced).find((rule) => rule.shortcut.key === "f10")?.whenAst).toEqual({
      type: "identifier",
      name: "terminalFocus",
    });
    const removed = await client.rpc.call("server.removeKeybinding", {
      key: "mod+shift+f10",
      command: "usage.open",
      when: "terminalFocus",
    });
    expect(shortcuts(removed).map((rule) => rule.shortcut.key)).not.toContain("f10");
  });

  it("adds and removes a script command", async () => {
    const rule = { key: "mod+shift+f8", command: "script.sample-1.run" } as const;
    const added = await client.rpc.call("server.upsertKeybinding", rule);
    expect(added.keybindings.map((entry) => entry.command)).toContain(rule.command);
    const removed = await client.rpc.call("server.removeKeybinding", rule);
    expect(removed.keybindings.map((entry) => entry.command)).not.toContain(rule.command);
  });

  it("refuses to change a malformed keybindings file", async () => {
    const rule = { key: "mod+shift+f11", command: "usage.open" };
    const { keybindingsConfigPath } = await client.server.getConfig();
    const saved = await NodeFSP.readFile(keybindingsConfigPath, "utf8");
    await NodeFSP.writeFile(keybindingsConfigPath, "{ malformed");
    try {
      const record = await refusal(client.rpc.call("server.upsertKeybinding", rule));
      expect(isRpcErrorOfTag(record, "KeybindingsConfigParseError")).toBe(true);
    } finally {
      await NodeFSP.writeFile(keybindingsConfigPath, saved);
    }
  });

  it("refuses to update a provider with no installer", async () => {
    const record = await refusal(
      client.rpc.call("server.updateProvider", {
        provider: ProviderDriverKind.parse("sample"),
        instanceId: ProviderInstanceId.parse("sample_missing"),
      }),
    );
    expect(isRpcErrorOfTag(record, "ServerProviderUpdateError")).toBe(true);
  });

  it("takes a client's activity report", async () => {
    await expect(
      client.rpc.call("server.reportClientActivity", {
        clientId: "sample-client",
        clientKind: "unknown",
        visible: true,
        focused: false,
        recentlyInteracted: false,
        appState: "active",
        lowPowerMode: "unknown",
        scopes: [{ type: "server-config" }, { type: "diagnostics" }],
        ttlMs: 1_000,
        observedAt: new Date().toISOString(),
      }),
    ).resolves.toBeUndefined();
  });

  it("takes an activity time with an offset", async () => {
    await expect(
      client.rpc.call("server.reportClientActivity", {
        clientId: "sample-client",
        clientKind: "unknown",
        visible: true,
        focused: false,
        recentlyInteracted: false,
        scopes: [],
        observedAt: "2026-01-01T01:00:00+01:00",
      }),
    ).resolves.toBeUndefined();
  });

  it("discovers source control tools", async () => {
    const found = await client.rpc.call("server.discoverSourceControl", {});
    const git = found.versionControlSystems.find((item) => item.kind === "git");
    expect(git).toMatchObject({
      status: "available",
      version: { _tag: "Some" },
    });
    expect(found.sourceControlProviders.length).toBeGreaterThan(0);
    for (const provider of found.sourceControlProviders) {
      expect(provider.auth.status).toEqual(expect.any(String));
    }
  });

  it("refreshes usage rates", async () => {
    const pricing = await client.rpc.call("server.refreshUsageRates", {});
    expect(["fresh", "cached", "unavailable"]).toContain(pricing.status);
  });
});

describe.skipIf(!hasLiveServer)("settings scopes", () => {
  const owner = connect();
  let settingsWriter: T3Client;
  let providerManager: T3Client;
  const connectWith = async (scope: string) => {
    const { credential } = await owner.auth.createPairingCredential({
      label: `sample-${scope}`,
      scopes: ["orchestration:read", scope as never],
    });
    const scoped = T3Client.create({ baseUrl: baseUrl!, webSocket });
    await scoped.auth.exchangePairingToken(credential);
    return scoped;
  };
  beforeAll(async () => {
    settingsWriter = await connectWith("settings:write");
    providerManager = await connectWith("providers:manage");
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
