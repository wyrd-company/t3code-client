// ---
// relationships:
//   verifies: library
// ---
import { describe, expect, it } from "vite-plus/test";
import { httpError } from "../transport/httpAnswer.ts";
import { rpcMethods } from "../rpc/registry.ts";
import { AssetCreateUrlInput } from "./assets.ts";
import { ExecutionEnvironmentCapabilities } from "./environment.ts";
import { EnvironmentInternalError, ServerStartupStatus } from "./httpErrors.ts";
import { KeybindingCommandInput, STATIC_KEYBINDING_COMMANDS } from "./keybindings.ts";
import { ManagedPolicySummaryLimits } from "./managedPolicy.ts";
import { decodeRpcErrorRecord, isRpcErrorOfTag } from "./rpcErrors.ts";
import { ServerConfig, ServerObservability, ServerSettings } from "./server.ts";
import { ServerSettingsPatch, requiredScopesForSettingsUpdate } from "./settingsPatch.ts";
import { SpeechTranscriptionOptions } from "./speech.ts";
import { UsageLimitSourceSnapshot } from "./usageLimitSources.ts";

const at = "2026-01-01T00:00:00.000Z";

describe("server field changes of 0.1.12", () => {
  it("reads the probe's server time, feature flags and the relay tracing policy", () => {
    const probe = rpcMethods["server.probe"].success;
    expect(probe.parse({ serverTime: at })).toEqual({ serverTime: at });
    expect(probe.parse({})).toEqual({});
    const flags = { secretProviders: true, tanstackSource: false };
    expect(ServerConfig.shape.featureFlags.parse(flags)).toEqual(flags);
    expect(ServerConfig.shape.featureFlags.safeParse({ secretProviders: "on" }).success).toBe(
      false,
    );
    expect(ServerObservability.parse({ relayTracingAllowed: true }).relayTracingAllowed).toBe(true);
  });

  it("reads and patches agent feedback and the workflows beta", () => {
    const settings = ServerSettings.parse({
      agentFeedback: { mode: "on-request" },
      workflowsEnabled: true,
      workflowSkippedRunsKept: 500,
    });
    expect(settings).toMatchObject({
      agentFeedback: { mode: "on-request" },
      workflowsEnabled: true,
    });
    expect(ServerSettings.parse({ agentFeedback: { mode: "later" } }).agentFeedback?.mode).toBe(
      "later",
    );
    const patch = ServerSettingsPatch.parse({
      agentFeedback: { mode: "auto" },
      workflowsEnabled: false,
      workflowSkippedRunsKept: 0,
    });
    expect(patch).toMatchObject({ agentFeedback: { mode: "auto" }, workflowSkippedRunsKept: 0 });
    for (const bad of [
      { agentFeedback: { mode: "later" } },
      { workflowSkippedRunsKept: 10_001 },
      { workflowSkippedRunsKept: -1 },
    ]) {
      expect(ServerSettingsPatch.safeParse(bad).success, JSON.stringify(bad)).toBe(false);
    }
    expect(requiredScopesForSettingsUpdate({ patch })).toEqual(["settings:write"]);
  });

  it("leaves the project script rule of 0.1.12 to the server", () => {
    const patch = ServerSettingsPatch.parse({ defaultProjectScripts: [] });
    expect(requiredScopesForSettingsUpdate({ patch })).toEqual(["settings:write"]);
  });

  it("reads the link, feedback and tracker account capabilities", () => {
    const flags = {
      linkThreadStream: true,
      linkClientPairing: true,
      linkPairingForLink: false,
      agentFeedback: true,
      issueTrackerAccounts: true,
    };
    expect(ExecutionEnvironmentCapabilities.parse(flags)).toMatchObject(flags);
    expect(ExecutionEnvironmentCapabilities.safeParse({ linkThreadStream: 1 }).success).toBe(false);
  });

  it("reads http usage limit sources with their quota accounts and routed models", () => {
    const window = { id: "five-hour", kind: "session", label: "5h", usedPercent: 12, resetsAt: at };
    const source = {
      id: "hub",
      kind: "http",
      label: "Sample hub",
      checkedAt: at,
      accounts: [
        {
          id: "account-1",
          driver: "codex",
          models: ["sample-model"],
          usageLimits: { checkedAt: at, windows: [] },
        },
      ],
      quotaAccounts: [
        { id: "quota-1", label: "Team", providerInstanceId: "sample", windows: [window] },
      ],
    };
    const parsed = UsageLimitSourceSnapshot.parse(source);
    expect(parsed.kind).toBe("http");
    expect(parsed.quotaAccounts?.[0]?.windows[0]).toMatchObject({ usedPercent: 12 });
    expect(parsed.accounts[0]?.models).toEqual(["sample-model"]);
    const save = { kind: "http", url: "https://hub.invalid/quota" };
    expect(ServerSettingsPatch.parse({ usageLimitSources: { hub: save } })).toEqual({
      usageLimitSources: { hub: save },
    });
    expect(
      ServerSettingsPatch.safeParse({ usageLimitSources: { hub: { ...save, kind: "other" } } })
        .success,
    ).toBe(false);
  });

  it("reads a starting server's 503 body and an internal error's safe detail", () => {
    const body = { status: "starting", migration: { current: 3, total: 9 } };
    const error = httpError(503, "GET", "/api/orchestration/shell", body);
    expect(error.status).toBe(503);
    expect(ServerStartupStatus.parse(error.body)).toEqual(body);
    expect(ServerStartupStatus.parse({ status: "starting", migration: null }).migration).toBeNull();
    expect(
      ServerStartupStatus.safeParse({ status: "starting", migration: { current: 0 } }).success,
    ).toBe(false);
    const internal = {
      _tag: "EnvironmentInternalError",
      code: "internal_error",
      reason: "internal_error",
      detail: "The model refused.",
      traceId: "trace-1",
    };
    expect(EnvironmentInternalError.parse(internal).detail).toBe("The model refused.");
  });

  it("reads the policy limit, keybindings, asset downloads, speech hints and new failures", () => {
    expect(ManagedPolicySummaryLimits.parse({ worktreeLayoutCommands: false })).toEqual({
      worktreeLayoutCommands: false,
    });
    expect(STATIC_KEYBINDING_COMMANDS).toEqual(
      expect.arrayContaining(["terminal.previous", "terminal.next"]),
    );
    expect(KeybindingCommandInput.safeParse("terminal.next").success).toBe(true);
    const resource = {
      _tag: "draft-workspace-file",
      cwd: "/srv/sample",
      path: "a.txt",
      disposition: "attachment",
    };
    expect(AssetCreateUrlInput.parse({ resource }).resource).toEqual(resource);
    expect(
      AssetCreateUrlInput.safeParse({ resource: { ...resource, disposition: "inline" } }).success,
    ).toBe(false);
    const options = {
      speechLanguage: "auto",
      speechTranslateToEnglish: false,
      speechCustomWords: [],
      speechRemoveFillerWords: true,
      speechHints: ["sample-project"],
    };
    expect(SpeechTranscriptionOptions.parse(options).speechHints).toEqual(["sample-project"]);
    expect(
      SpeechTranscriptionOptions.safeParse({ ...options, speechHints: Array(9).fill("w") }).success,
    ).toBe(false);
    const reveal = decodeRpcErrorRecord({
      _tag: "ExternalLauncherRevealTargetMissingError",
      editor: "vscode",
      target: "/srv/gone",
    });
    expect(isRpcErrorOfTag(reveal, "ExternalLauncherRevealTargetMissingError")).toBe(true);
    const update = decodeRpcErrorRecord({
      _tag: "ServerSelfUpdateError",
      reason: "The desktop app is on another track.",
      trackMismatch: { buildChannel: "nightly", savedChannel: "latest" },
    });
    expect(isRpcErrorOfTag(update, "ServerSelfUpdateError") && update.trackMismatch).toEqual({
      buildChannel: "nightly",
      savedChannel: "latest",
    });
  });
});
