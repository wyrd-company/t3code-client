// ---
// relationships:
//   verifies: library
// ---
import { describe, expect, it } from "vite-plus/test";
import { rpcMethods } from "../rpc/registry.ts";
import {
  DeviceActionInput,
  DeviceCloseInput,
  DeviceDetail,
  DeviceHostSummary,
  DeviceListInput,
  DeviceOpenInput,
  DeviceServiceState,
} from "./device.ts";
import { decodeRpcErrorRecord } from "./rpcErrors.ts";
import { SshDeviceHost } from "./deviceHosts.ts";

const host = (id: string, kind: string) => ({
  id,
  label: "Sample",
  kind,
  platforms: [{ platform: "ios", available: false, reason: "Sample" }],
  hubInstalled: false,
  agentDeviceInstalled: false,
});
const state = {
  hostStatus: "idle",
  hostStatuses: {},
  devices: [],
  sessions: [],
  onboardingCompleted: false,
  agentAccessEnabled: false,
  hubBasePath: "/api/device-hub",
  revision: 1,
  hosts: [host("local", "local")],
};

describe("device state", () => {
  it("puts every host in `hosts`, as the contract decodes it", () => {
    const decoded = DeviceServiceState.parse({
      ...state,
      easHosts: [host("sample-eas", "eas")],
      simlockHosts: [host("sample-pool", "simlock")],
    });
    expect(decoded.hosts.map((item) => item.id)).toEqual(["local", "sample-eas", "sample-pool"]);
    expect("easHosts" in decoded).toBe(false);
    expect("simlockHosts" in decoded).toBe(false);
  });

  it("reads the null that the server sends for an optional value", () => {
    const decoded = DeviceServiceState.parse({
      ...state,
      hostStatusDetail: null,
      bootingDevices: null,
      hostStatuses: { local: { status: "starting", detail: null } },
      hosts: [{ ...host("local", "local"), tools: null }],
    });
    expect(decoded.hostStatusDetail).toBeNull();
    expect(decoded.hosts[0]?.tools).toBeNull();
    expect(
      DeviceDetail.parse({
        hostId: "local",
        deviceId: "sample-device",
        settings: { location: null, appearance: null },
        foregroundApp: { id: "sample-app", name: null },
        readAt: "2026-01-01T00:00:00.000Z",
      }).foregroundApp?.name,
    ).toBeNull();
  });

  it("keeps a value that a newer server adds", () => {
    const decoded = DeviceServiceState.parse({
      ...state,
      hostStatus: "future",
      sampleField: 1,
      hosts: [host("sample", "future")],
    });
    expect(decoded.hostStatus).toBe("future");
    expect(decoded).toHaveProperty("sampleField", 1);
    expect(DeviceHostSummary.parse(host("sample", "future")).kind).toBe("future");
  });

  it("refuses a state that has lost a required value", () => {
    expect(DeviceServiceState.safeParse({ ...state, hosts: undefined }).success).toBe(false);
    expect(DeviceServiceState.safeParse({ ...state, revision: 1.5 }).success).toBe(false);
  });
});

describe("device inputs", () => {
  const target = { deviceId: "sample-device" };
  const accepted = (input: unknown) => DeviceActionInput.safeParse(input).success;

  it("accepts each action, and only its own fields", () => {
    for (const action of [
      { type: "setAppearance", value: "dark" },
      { type: "setTextSize", value: "extra-large" },
      { type: "setToggle", setting: "voiceOver", value: true },
      { type: "setLiquidGlass", value: "clear" },
      { type: "setColorFilter", value: "red-green" },
      { type: "setOrientation", value: "landscape_left" },
      { type: "setLocation", latitude: 90, longitude: -180 },
      { type: "clearLocation" },
      { type: "setPermission", appId: "sample-app", permission: "faceid", decision: "grant" },
      { type: "openUrl", url: "https://example.invalid" },
      { type: "launchApp", appId: "sample-app" },
      { type: "terminateApp", appId: "sample-app" },
      { type: "shake" },
      { type: "sendPush", appId: "sample-app", payload: "sample" },
      { type: "sendPush", appId: "sample-app", payload: { aps: {} } },
    ]) {
      expect(accepted({ ...target, ...action }), action.type).toBe(true);
    }
    for (const action of [
      { type: "future" },
      { type: "setAppearance", value: "future" },
      { type: "setToggle", setting: "future", value: true },
      { type: "setLocation", latitude: 91, longitude: 0 },
      { type: "setLocation", latitude: 0, longitude: 181 },
      { type: "setPermission", appId: "sample-app", permission: "future", decision: "grant" },
      { type: "openUrl", url: "  " },
      { type: "sendPush", appId: "sample-app", payload: 1 },
    ]) {
      expect(accepted({ ...target, ...action }), JSON.stringify(action)).toBe(false);
    }
    expect(accepted({ type: "shake" })).toBe(false);
  });

  it("applies the bounds of an id and closes a platform", () => {
    const open = (input: object) =>
      DeviceOpenInput.safeParse({ threadId: "t", deviceId: "d", platform: "ios", ...input })
        .success;
    expect(open({})).toBe(true);
    expect(open({ platform: "future" })).toBe(false);
    expect(open({ deviceId: "x".repeat(257) })).toBe(false);
    expect(open({ hostId: "x".repeat(129) })).toBe(false);
    expect(DeviceCloseInput.safeParse({ threadId: "t" }).success).toBe(true);
    expect(DeviceListInput.safeParse({ updateTool: "future" }).success).toBe(false);
  });

  it("refuses the reserved id for a host to test", () => {
    const test = (id: string) =>
      SshDeviceHost.safeParse({ id, label: "Sample", target: "sample.invalid" }).success;
    expect(test("sample-ssh")).toBe(true);
    expect(test("local")).toBe(false);
    expect(
      SshDeviceHost.safeParse({ id: "sample", label: "Sample", target: "-oProxyCommand=x" })
        .success,
    ).toBe(false);
  });
});

describe("device scopes", () => {
  const scopes = rpcMethods["device.list"].payloadScopes;
  it("asks for the operate scope only when a list can change a host", () => {
    expect(scopes?.({})).toEqual([]);
    expect(scopes?.({ inspectOnly: true })).toEqual([]);
    expect(scopes?.({ inspectOnly: true, retryHostId: "sample" })).toEqual([]);
    expect(scopes?.({ retryHostId: "sample" })).toEqual(["orchestration:operate"]);
    expect(scopes?.({ updateTool: "agent" })).toEqual(["orchestration:operate"]);
    expect(scopes?.({ updateTool: "hub", inspectOnly: true })).toEqual(["orchestration:operate"]);
  });
});

describe("device failures", () => {
  it("decodes a failure with its null values and an open reason", () => {
    const boot = decodeRpcErrorRecord({
      _tag: "DeviceBootError",
      hostId: "local",
      deviceId: "sample-device",
      reason: "a-future-reason",
      diagnostics: null,
      cause: { name: "Error" },
    });
    expect(boot).toMatchObject({ _tag: "DeviceBootError", reason: "a-future-reason" });
    for (const raw of [
      { _tag: "DeviceHostUnavailableError", hostId: "local", hostLabel: null, reason: "Sample" },
      { _tag: "DevicePlatformUnavailableError", hostId: "local", platform: "ios", reason: "S" },
      { _tag: "DeviceNotFoundError", hostId: "local", deviceId: "d" },
      {
        _tag: "DeviceOperationError",
        operation: "list",
        reason: "request_failed",
        exitCode: null,
        cause: null,
      },
      {
        _tag: "DeviceActionUnavailableError",
        operation: "x",
        platform: "ios",
        reason: "unsupported",
      },
      { _tag: "DeviceEasAccountError", reason: "Sample" },
      { _tag: "DeviceSimlockIdentityError", reason: "Sample" },
    ]) {
      expect(decodeRpcErrorRecord(raw), raw._tag).toMatchObject({ _tag: raw._tag });
    }
  });
});
