// ---
// relationships:
//   verifies: library
// ---
import * as NodeFS from "node:fs";
import { describe, expect, it } from "vite-plus/test";

import { intervalTask } from "../../test/support/scheduledTaskFixtures.ts";
import { schemas } from "../index.ts";
import { AuthMcpApprovalDetails } from "./authMcp.ts";
import { EnvironmentPairingCredentialError } from "./httpErrors.ts";
import { ManagedPolicySummary } from "./managedPolicy.ts";
import { decodeRpcErrorRecord, isRpcErrorOfTag } from "./rpcErrors.ts";
import { ScheduledTask } from "./scheduledTask.ts";
import { ServerConfig } from "./server.ts";

const config: Record<string, unknown> = JSON.parse(
  NodeFS.readFileSync(new URL("../../test/fixtures/server-config.json", import.meta.url), "utf8"),
);
const summary = {
  organization: "Sample Org",
  supportUrl: "https://support.example.invalid",
  lockedSettings: ["storageCleanup.logsAfterDays"],
  limits: {
    maxRuntimeMode: "auto-accept-edits",
    clients: ["desktop", "local-browser"],
    connect: false,
    webhookTasks: false,
    providers: {
      allowedDrivers: ["codex"],
      lockedInstanceFields: { codex: ["config.binaryPath", "environment"] },
    },
    updates: { mode: "off", allowNightly: false },
  },
};

describe("managed policy schemas", () => {
  it("decodes the summary that clients see, keeping newer limits and literals", () => {
    expect(ManagedPolicySummary.parse(summary)).toEqual(summary);
    const newer = {
      ...summary,
      limits: { maxRuntimeMode: "future-mode", clients: ["future-client"], futureLimit: true },
    };
    expect(ManagedPolicySummary.parse(newer)).toEqual(newer);
    expect(ManagedPolicySummary.safeParse({ organization: "Sample Org" }).success).toBe(false);
    expect(ManagedPolicySummary.safeParse({ ...summary, organization: " " }).success).toBe(false);
    expect(ManagedPolicySummary.safeParse({ ...summary, limits: { clients: [] } }).success).toBe(
      false,
    );
    expect(schemas.managedPolicy.ManagedPolicySummary).toBe(ManagedPolicySummary);
  });

  it("reads managedPolicy on the server config and leaves it absent without a policy", () => {
    expect(ServerConfig.parse(config).managedPolicy).toBeUndefined();
    expect(ServerConfig.parse({ ...config, managedPolicy: summary }).managedPolicy).toEqual(
      summary,
    );
  });

  it("reads the runtime-mode ceiling on MCP approval details", () => {
    const details = {
      clientName: "Sample",
      redirectHost: "a.invalid",
      environmentHost: "b.invalid",
    };
    const ceiling = { organization: "Sample Org", maxRuntimeMode: "auto" };
    expect(AuthMcpApprovalDetails.parse({ ...details, runtimeModeCeiling: ceiling })).toEqual({
      ...details,
      runtimeModeCeiling: ceiling,
    });
    expect(
      AuthMcpApprovalDetails.safeParse({ ...details, runtimeModeCeiling: { organization: "x" } })
        .success,
    ).toBe(false);
  });

  it("reads blockedByPolicy on a scheduled task", () => {
    const blocked = { ...intervalTask, blockedByPolicy: "Sample Org does not allow webhooks." };
    expect(ScheduledTask.parse(blocked).blockedByPolicy).toBe(blocked.blockedByPolicy);
    expect(ScheduledTask.parse(intervalTask).blockedByPolicy).toBeUndefined();
  });

  it("decodes the policy refusal of a pairing credential", () => {
    const refusal = { _tag: "EnvironmentHttpForbiddenError", message: "Remote clients are off." };
    expect(EnvironmentPairingCredentialError.parse(refusal)).toEqual(refusal);
    expect(
      EnvironmentPairingCredentialError.safeParse({ _tag: "EnvironmentHttpConflictError" }).success,
    ).toBe(false);
  });

  it("decodes the policy operations of a settings failure and the relay install reason", () => {
    const managed = decodeRpcErrorRecord({
      _tag: "ServerSettingsError",
      settingsPath: "/sample/settings.json",
      operation: "write-managed-setting",
      managedSetting: "storageCleanup.logsAfterDays",
      managedBy: "Sample Org",
    });
    expect(isRpcErrorOfTag(managed, "ServerSettingsError")).toBe(true);
    expect(managed).toMatchObject({ managedSetting: "storageCleanup.logsAfterDays" });
    const disallowed = decodeRpcErrorRecord({
      _tag: "ServerSettingsError",
      settingsPath: "/sample/settings.json",
      operation: "use-disallowed-provider",
      providerInstanceId: "sample",
      managedBy: "Sample Org",
      providerLabel: "Sample",
    });
    expect(disallowed).toMatchObject({ providerLabel: "Sample", managedBy: "Sample Org" });
    const relay = decodeRpcErrorRecord({
      _tag: "RelayClientInstallFailedError",
      reason: "managed_by_policy",
      message: "Sample Org manages T3 Connect.",
    });
    expect(isRpcErrorOfTag(relay, "RelayClientInstallFailedError")).toBe(true);
  });
});
