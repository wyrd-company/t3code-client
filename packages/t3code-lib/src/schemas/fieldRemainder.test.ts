// ---
// relationships:
//   verifies: library
// ---
/** The 0.1.7 settings, usage, schedule, turn usage and descriptor fields. */
import { describe, expect, it } from "vite-plus/test";
import { DeviceEasAccountInput } from "./device.ts";
import { ExecutionEnvironmentCapabilities } from "./environment.ts";
import { TurnTokenUsage } from "./orchestration/providerRuntime.ts";
import { SelectProviderOptionDescriptor } from "./provider.ts";
import { SettingsSecretValue, UsageLimitSourceConfig } from "./providerInstance.ts";
import {
  ScheduledTaskSchedule,
  ScheduledTaskUpsertSchedule,
  isIsoDateTimeWithOffset,
} from "./scheduledTaskSchedule.ts";
import { ServerSettings } from "./server.ts";
import { ServerSettingsPatch } from "./settingsPatch.ts";
import { UsageSummaryInput, usageDay } from "./usage.ts";

const secret = { provider: "sample", reference: "op://vault/item/field" };

describe("one-time schedules", () => {
  it("reads and writes a run time with an offset", () => {
    const once = { type: "once", runAt: "2030-01-31T09:30:00+02:00" };
    expect(ScheduledTaskSchedule.parse(once)).toEqual(once);
    expect(ScheduledTaskUpsertSchedule.parse(once)).toEqual(once);
    expect(ExecutionEnvironmentCapabilities.parse({ oneTimeSchedules: true })).toMatchObject({
      oneTimeSchedules: true,
    });
  });

  it("refuses a run time without an offset, an impossible day or a five-digit year", () => {
    expect(isIsoDateTimeWithOffset("2030-01-31T09:30:00Z")).toBe(true);
    expect(isIsoDateTimeWithOffset("2028-02-29T00:00:00.5-05:00")).toBe(true);
    for (const runAt of [
      "2030-01-31T09:30:00",
      "2030-02-30T09:30:00Z",
      "2030-02-29T09:30:00Z",
      "9999-12-31T23:30:00-05:00",
    ]) {
      expect(isIsoDateTimeWithOffset(runAt)).toBe(false);
      expect(ScheduledTaskUpsertSchedule.safeParse({ type: "once", runAt }).success).toBe(false);
    }
  });
});

describe("settings fields", () => {
  it("writes hidden thread tags and reads them leniently", () => {
    const patch = { hiddenThreadTags: ["sample-tag"], hideTaggedThreads: true };
    expect(ServerSettingsPatch.parse(patch)).toEqual(patch);
    expect(
      ServerSettings.parse({ hiddenThreadTags: ["sample-tag", 7, null], hideTaggedThreads: true }),
    ).toEqual(patch);
  });

  it("reads a usage model filter and drops an invalid one", () => {
    const usageModelFilter = { include: [{ model: "sample-model" }] };
    expect(ServerSettings.parse({ usageModelFilter })).toEqual({ usageModelFilter });
    expect(ServerSettings.parse({ usageModelFilter: { include: "sample-model" } })).toEqual({
      usageModelFilter: undefined,
    });
  });

  it("accepts a literal or a secret reference in each secret field", () => {
    expect(SettingsSecretValue.parse(" sample-key ")).toBe("sample-key");
    expect(SettingsSecretValue.parse(secret)).toEqual(secret);
    expect(SettingsSecretValue.safeParse({ provider: "sample" }).success).toBe(false);
    const source = { kind: "cliproxy", url: "http://host.invalid:9", managementKey: secret };
    expect(UsageLimitSourceConfig.parse(source)).toEqual(source);
    const host = { kind: "eas", id: "sample-eas", label: "Sample", accessToken: secret };
    expect(ServerSettingsPatch.parse({ easDeviceHosts: [host] })).toEqual({
      easDeviceHosts: [host],
    });
    expect(DeviceEasAccountInput.parse({ accessToken: secret })).toEqual({ accessToken: secret });
  });
});

describe("usage and turn fields", () => {
  it("sends a usage model filter", () => {
    const day = usageDay("2030-01-01");
    const input = {
      sinceDay: day,
      untilDay: day,
      timeZone: "Etc/UTC",
      modelFilter: { exclude: [{ provider: "codex", model: "sample-model" }] },
    };
    expect(UsageSummaryInput.parse(input)).toEqual(input);
    expect(
      UsageSummaryInput.safeParse({ ...input, modelFilter: { exclude: [{ model: "" }] } }).success,
    ).toBe(false);
  });

  it("reads turn usage models, local commands and other usage", () => {
    const usage = {
      usageScope: "main_agent",
      usageStatus: "complete",
      inputTokens: 10,
      outputTokens: 2,
      hasSubagents: true,
      models: ["sample-model"],
      localCommand: false,
      otherUsage: { inputTokens: 4, outputTokens: 1 },
    };
    expect(TurnTokenUsage.parse(usage)).toEqual(usage);
  });

  it("reads the reasoning role of a select descriptor and keeps a newer role", () => {
    const descriptor = {
      id: "thought_level",
      label: "Thought level",
      type: "select",
      options: [{ id: "high", label: "High" }],
      role: "reasoning",
    };
    expect(SelectProviderOptionDescriptor.parse(descriptor)).toEqual(descriptor);
    expect(SelectProviderOptionDescriptor.parse({ ...descriptor, role: "sample" }).role).toBe(
      "sample",
    );
  });
});
