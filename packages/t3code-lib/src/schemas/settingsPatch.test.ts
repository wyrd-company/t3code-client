// ---
// relationships:
//   verifies: library
// ---
import { describe, expect, it } from "vite-plus/test";
import { rpcMethods } from "../rpc/registry.ts";
import { ProviderInstanceMutation } from "./providerInstance.ts";
import {
  requiredScopesForSettingsUpdate,
  ServerSettingsPatch,
  ServerUpdateSettingsInput,
} from "./settingsPatch.ts";

const instance = { driver: "codex", enabled: false };
const remove = { operation: "remove", instanceId: "sample" };

describe("ServerSettingsPatch", () => {
  it("sends only what the caller set", () => {
    expect(ServerSettingsPatch.parse({ idleCompaction: "off" })).toEqual({
      idleCompaction: "off",
    });
    expect(ServerSettingsPatch.parse({})).toEqual({});
    expect(ServerSettingsPatch.parse({ easDeviceHosts: [] })).toEqual({
      easDeviceHosts: [],
    });
    expect(
      ServerSettingsPatch.parse({
        easDeviceHosts: [{ kind: "eas", id: "sample", label: "Sample" }],
      }).easDeviceHosts?.[0],
    ).toEqual({ kind: "eas", id: "sample", label: "Sample" });
  });
  it("takes a fractional auto-settle time", () => {
    expect(ServerSettingsPatch.safeParse({ sidebarAutoSettleAfterDays: 1.5 }).success).toBe(true);
  });
  it("takes partial cleanup rules in the patch, and only whole rules in a project override", () => {
    const partial = { mode: "custom", rules: { worktreeOnMerge: true, worktreeAfterDays: 30 } };
    const whole = {
      mode: "custom",
      rules: {
        worktreeAfterDays: 30,
        worktreeOnMerge: true,
        worktreeOnDelete: false,
        worktreeUnchanged: false,
      },
    };
    const override = (worktreeCleanup: unknown) =>
      ServerSettingsPatch.safeParse({
        projectSettingsOverrides: { "project-1": { worktreeCleanup } },
      }).success;
    expect(ServerSettingsPatch.safeParse({ worktreeCleanup: partial }).success).toBe(true);
    expect(override(partial)).toBe(false);
    expect(override(whole)).toBe(true);
  });
  it("keeps a key of a newer server", () => {
    expect(ServerSettingsPatch.parse({ futureSetting: 1 })).toEqual({
      futureSetting: 1,
    });
  });
  it("sends a secret reference in its wire field", () => {
    const secret = { provider: "sample", reference: "sample/path" };
    const environment = [{ name: "SAMPLE_KEY", value: "", sensitive: true, secret }];
    expect(
      ServerSettingsPatch.parse({
        providerInstances: { sample: { ...instance, environment } },
      }),
    ).toEqual({ providerInstances: { sample: { ...instance, environment } } });
  });
  it.each([
    ["a value outside a closed list", { defaultRuntimeMode: "sample" }],
    ["a retention outside its range", { storageCleanup: { logsAfterDays: 0 } }],
    ["a cleanup with no mode", { worktreeCleanup: { rules: {} } }],
    ["too many snooze presets", { snoozePresets: Array(9).fill({ kind: "after", minutes: 1 }) }],
    [
      "a snooze time out of range",
      { snoozePresets: [{ kind: "at", day: "today", time: "24:00" }] },
    ],
    ["the reserved host id", { deviceHosts: [{ id: "local", label: "Sample", target: "sample" }] }],
    [
      "a repeated host id",
      {
        deviceHosts: [
          { id: "sample", label: "Sample", target: "sample" },
          { id: "sample", label: "Sample", target: "sample" },
        ],
      },
    ],
    [
      "an idle limit not under the session limit",
      {
        easDeviceHosts: [
          {
            kind: "eas",
            id: "sample",
            label: "Sample",
            idleMinutes: 30,
            maxSessionMinutes: 30,
          },
        ],
      },
    ],
    ["an invalid provider instance key", { providerInstances: { "1sample": instance } }],
    ["a provider instance with no driver", { providerInstances: { sample: {} } }],
    ["an unknown usage source kind", { usageLimitSources: { sample: { kind: "x", url: "x" } } }],
    ["a negative price", { usagePriceOverrides: { sample: { inputCostPerMillionTokens: -1 } } }],
  ])("refuses %s", (_name, patch) => {
    expect(ServerSettingsPatch.safeParse(patch).success).toBe(false);
  });
});

describe("a refused secret", () => {
  it("stays out of the validation issues", () => {
    const value = "sample-value-kept-private";
    const refused = [
      rpcMethods["secrets.answerRequest"].payload.safeParse({
        threadId: "",
        turnItemId: "item-1",
        answer: { type: "save", secret: value },
      }),
      ServerSettingsPatch.safeParse({
        usageLimitSources: { sample: { kind: "x", url: "x", managementKey: value } },
      }),
    ];
    for (const result of refused) {
      expect(result.success).toBe(false);
      expect(JSON.stringify(result.error)).not.toContain(value);
    }
  });
});

describe("ProviderInstanceMutation", () => {
  it("needs an instance for a create and an upsert, and none for a remove", () => {
    const instanceId = "sample";
    expect(ProviderInstanceMutation.safeParse(remove).success).toBe(true);
    for (const operation of ["create", "upsert"]) {
      expect(ProviderInstanceMutation.safeParse({ operation, instanceId, instance }).success).toBe(
        true,
      );
      expect(ProviderInstanceMutation.safeParse({ operation, instanceId }).success).toBe(false);
    }
  });
});

describe("requiredScopesForSettingsUpdate", () => {
  const providers = { providerInstances: {} };
  it.each([
    ["an empty patch", {}, undefined, ["settings:write"]],
    ["a setting", { idleCompaction: "off" }, undefined, ["settings:write"]],
    ["a provider key", providers, undefined, ["providers:manage"]],
    ["a usage source", { usageLimitSources: {} }, undefined, ["providers:manage"]],
    ["a secret provider", { secretProviders: {} }, undefined, ["providers:manage"]],
    [
      "both",
      { ...providers, idleCompaction: "off" },
      undefined,
      ["settings:write", "providers:manage"],
    ],
    ["a mutation alone", {}, remove, ["providers:manage"]],
    [
      "a mutation and a setting",
      { idleCompaction: "off" },
      remove,
      ["settings:write", "providers:manage"],
    ],
    [
      "an undefined setting",
      { idleCompaction: undefined, ...providers },
      undefined,
      ["providers:manage"],
    ],
    ["only an unknown key", { futureSetting: 1 }, undefined, ["settings:write"]],
    ["an unknown key and a mutation", { futureSetting: 1 }, remove, ["providers:manage"]],
  ])("for %s", (_name, patch, providerInstanceMutation, expected) => {
    const input = ServerUpdateSettingsInput.parse({
      patch,
      ...(providerInstanceMutation === undefined ? {} : { providerInstanceMutation }),
    });
    expect(requiredScopesForSettingsUpdate(input)).toEqual(expected);
  });
  it("replaces the method's scope, and adds the second one", () => {
    const spec = rpcMethods["server.updateSettings"];
    const parse = (patch: unknown) => spec.payload.parse({ patch });
    const only = parse({ providerInstances: {} });
    expect(spec.scopeForPayload?.(only)).toBe("providers:manage");
    expect(spec.payloadScopes?.(only)).toEqual([]);
    const both = parse({ providerInstances: {}, idleCompaction: "off" });
    expect(spec.scopeForPayload?.(both)).toBe("settings:write");
    expect(spec.payloadScopes?.(both)).toEqual(["providers:manage"]);
  });
});

describe("a keybinding write", () => {
  const spec = rpcMethods["server.upsertKeybinding"].payload;
  const key = "mod+shift+u";
  it.each(["usage.open", "script.sample-1.run"])("takes %s", (command) => {
    expect(spec.safeParse({ key, command }).success).toBe(true);
    expect(spec.safeParse({ key, command: "usage.open", replace: { key, command } }).success).toBe(
      true,
    );
    expect(rpcMethods["server.removeKeybinding"].payload.safeParse({ key, command }).success).toBe(
      true,
    );
  });
  it.each(["sample.invalid", "script.run", "script..run", "script.Sample.run", "script.-a.run"])(
    "refuses %s",
    (command) => {
      expect(spec.safeParse({ key, command }).success).toBe(false);
      expect(
        rpcMethods["server.removeKeybinding"].payload.safeParse({ key, command }).success,
      ).toBe(false);
    },
  );
});
