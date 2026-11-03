/** Tagged failures of the device RPC methods, mirroring the contracts' `device.ts`. */
import { z } from "zod";
import { forwardCompatibleLiteral } from "../common.ts";
import { Defect, taggedError } from "./shared.ts";

const DevicePlatform = forwardCompatibleLiteral(["ios", "android"]);

export const DeviceHostUnavailableError = taggedError("DeviceHostUnavailableError", {
  hostId: z.string(),
  hostLabel: z.string().nullish(),
  reason: z.string(),
  cause: Defect.optional(),
});
export const DevicePlatformUnavailableError = taggedError("DevicePlatformUnavailableError", {
  hostId: z.string(),
  platform: DevicePlatform,
  reason: z.string(),
});
export const DeviceNotFoundError = taggedError("DeviceNotFoundError", {
  hostId: z.string(),
  deviceId: z.string(),
});
export const DeviceBootError = taggedError("DeviceBootError", {
  hostId: z.string(),
  deviceId: z.string(),
  reason: forwardCompatibleLiteral(["disk_space", "timeout", "launch_failed"]),
  diagnostics: z.string().nullish(),
  cause: Defect,
});
export const DeviceOperationError = taggedError("DeviceOperationError", {
  operation: z.string(),
  reason: forwardCompatibleLiteral([
    "command_failed",
    "request_failed",
    "invalid_payload",
    "settings_failed",
    "hub_rejected",
  ]),
  exitCode: z.number().nullish(),
  cause: Defect,
});
export const DeviceActionUnavailableError = taggedError("DeviceActionUnavailableError", {
  operation: z.string(),
  platform: DevicePlatform,
  reason: forwardCompatibleLiteral(["unsupported", "helper_missing"]),
});
export const DeviceEasAccountError = taggedError("DeviceEasAccountError", { reason: z.string() });
export const DeviceSimlockIdentityError = taggedError("DeviceSimlockIdentityError", {
  reason: z.string(),
});

export const deviceRpcErrors = [
  DeviceHostUnavailableError,
  DevicePlatformUnavailableError,
  DeviceNotFoundError,
  DeviceBootError,
  DeviceOperationError,
  DeviceActionUnavailableError,
  DeviceEasAccountError,
  DeviceSimlockIdentityError,
] as const;
