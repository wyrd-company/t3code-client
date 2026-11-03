// ---
// relationships:
//   implements: library
// ---
import { z } from "zod";
import { VoidSuccess, defineMethod } from "../spec.ts";
import {
  DeviceActionInput,
  DeviceCloseInput,
  DeviceConfigureInput,
  DeviceDetail,
  DeviceDetailInput,
  DeviceEasAccount,
  DeviceEasAccountInput,
  DeviceHostSummary,
  DeviceListInput,
  DeviceOpenInput,
  DeviceServiceState,
  DeviceSession,
  DeviceShutdownInput,
  DeviceSimlockIdentity,
  DeviceSimlockIdentityInput,
} from "../../schemas/device.ts";
import { SshDeviceHost } from "../../schemas/deviceHosts.ts";

// A reader sees hosts and devices. A credential check or a host test holds a secret or
// reaches another machine, so it has the scope of a settings write.
export const deviceMethods = {
  "device.list": defineMethod({
    payload: DeviceListInput,
    success: DeviceServiceState,
    stream: false,
    scope: "orchestration:read",
    // The server takes `inspectOnly` first, unless a tool update is also asked for.
    payloadScopes: ({ updateTool, inspectOnly, retryHostId }) =>
      updateTool !== undefined || (retryHostId !== undefined && inspectOnly !== true)
        ? ["orchestration:operate"]
        : [],
  }),
  "device.configure": defineMethod({
    payload: DeviceConfigureInput,
    success: DeviceServiceState,
    stream: false,
    scope: "settings:write",
  }),
  "device.testHost": defineMethod({
    payload: SshDeviceHost,
    success: DeviceHostSummary,
    stream: false,
    scope: "settings:write",
  }),
  "device.easAccount": defineMethod({
    payload: DeviceEasAccountInput,
    success: DeviceEasAccount,
    stream: false,
    scope: "settings:write",
  }),
  "device.simlockIdentity": defineMethod({
    payload: DeviceSimlockIdentityInput,
    success: DeviceSimlockIdentity,
    stream: false,
    scope: "settings:write",
  }),
  "device.open": defineMethod({
    payload: DeviceOpenInput,
    success: DeviceSession,
    stream: false,
    scope: "orchestration:operate",
  }),
  "device.close": defineMethod({
    payload: DeviceCloseInput,
    success: VoidSuccess,
    stream: false,
    scope: "orchestration:operate",
  }),
  "device.shutdown": defineMethod({
    payload: DeviceShutdownInput,
    success: VoidSuccess,
    stream: false,
    scope: "orchestration:operate",
  }),
  "device.detail": defineMethod({
    payload: DeviceDetailInput,
    success: DeviceDetail,
    stream: false,
    scope: "orchestration:read",
  }),
  "device.action": defineMethod({
    payload: DeviceActionInput,
    success: DeviceDetail,
    stream: false,
    scope: "orchestration:operate",
  }),
  subscribeDeviceState: defineMethod({
    payload: z.looseObject({}),
    success: DeviceServiceState,
    stream: true,
    scope: "orchestration:read",
  }),
} as const;
