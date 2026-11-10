// ---
// relationships:
//   implements: library
// ---
/**
 * Mirrors `packages/contracts/src/device.ts`: the device hosts of a server, their
 * simulators and emulators, and the sessions that threads hold. A closed value in an
 * input has its own form, because the same name in a result stays open for a newer
 * server. Unknown keys pass. The server can send an optional value of a result as `null`,
 * so such a value is nullish.
 */
import { z } from "zod";
import { ThreadId, TrimmedNonEmptyString, forwardCompatibleLiteral } from "./common.ts";
import { SettingsSecretValue } from "./providerInstance.ts";

const TrimmedString = z.string().trim();
const DeviceHostId = TrimmedNonEmptyString.max(128);
const DeviceId = TrimmedNonEmptyString.max(256);
const DevicePlatformInput = z.enum(["ios", "android"]);

const DEVICE_PLATFORMS = ["ios", "android"] as const;
const DevicePlatform = forwardCompatibleLiteral(DEVICE_PLATFORMS);

export const DeviceListInput = z.looseObject({
  /** Installs or updates a tool on a host. Needs `orchestration:operate`. */
  updateTool: z.enum(["hub", "agent"]).optional(),
  /** Reads what is installed, and changes nothing. */
  inspectOnly: z.boolean().optional(),
  /** Retries a failed host, which can start its tools. Needs `orchestration:operate`. */
  retryHostId: DeviceHostId.optional(),
});
export type DeviceListInput = z.input<typeof DeviceListInput>;

export const DeviceConfigureInput = z.looseObject({
  enabled: z.boolean().optional(),
  agentAccessEnabled: z.boolean().optional(),
  onboardingCompleted: z.boolean().optional(),
});
export type DeviceConfigureInput = z.input<typeof DeviceConfigureInput>;

export const DeviceEasAccountInput = z.looseObject({
  /** A saved EAS host whose stored token is checked when no new token is given. */
  hostId: DeviceHostId.optional(),
  /** A token, or the secret provider reference to read it from. */
  accessToken: SettingsSecretValue.optional(),
});
export type DeviceEasAccountInput = z.input<typeof DeviceEasAccountInput>;

export const DeviceSimlockIdentityInput = z.looseObject({
  /** Without one, the gateway that the server's agent-device points at. */
  gatewayUrl: TrimmedString.optional(),
  /** A saved Simlock host whose stored token is checked when no new token is given. */
  hostId: DeviceHostId.optional(),
  /** A token, or the secret provider reference to read it from. */
  agentToken: SettingsSecretValue.optional(),
});
export type DeviceSimlockIdentityInput = z.input<typeof DeviceSimlockIdentityInput>;

export const DeviceOpenInput = z.looseObject({
  threadId: ThreadId,
  hostId: DeviceHostId.optional(),
  deviceId: DeviceId,
  platform: DevicePlatformInput,
  /** Boot the simulator or emulator when it is not running. The server's default is true. */
  boot: z.boolean().optional(),
});
export type DeviceOpenInput = z.input<typeof DeviceOpenInput>;

export const DeviceCloseInput = z.looseObject({
  hostId: DeviceHostId.optional(),
  threadId: ThreadId,
  /** Without one, closes every device session of the thread. */
  deviceId: DeviceId.optional(),
  /** Also shuts the simulator or emulator down. The server's default is false. */
  shutdown: z.boolean().optional(),
});
export type DeviceCloseInput = z.input<typeof DeviceCloseInput>;

export const DeviceShutdownInput = z.looseObject({
  hostId: DeviceHostId.optional(),
  deviceId: DeviceId,
  platform: DevicePlatformInput,
});
export type DeviceShutdownInput = z.input<typeof DeviceShutdownInput>;

const deviceTarget = { hostId: DeviceHostId.optional(), deviceId: DeviceId };

export const DeviceDetailInput = z.looseObject(deviceTarget);
export type DeviceDetailInput = z.input<typeof DeviceDetailInput>;

const AppId = TrimmedNonEmptyString;
const action = <const Type extends string, const Shape extends z.ZodRawShape>(
  type: Type,
  shape: Shape,
) => z.looseObject({ ...deviceTarget, type: z.literal(type), ...shape });

export const DeviceActionInput = z.discriminatedUnion("type", [
  action("setAppearance", { value: z.enum(["light", "dark"]) }),
  action("setTextSize", { value: z.enum(["small", "default", "large", "extra-large"]) }),
  action("setToggle", {
    setting: z.enum([
      "reduceMotion",
      "increaseContrast",
      "reduceTransparency",
      "showBorders",
      "voiceOver",
      "networkEnabled",
    ]),
    value: z.boolean(),
  }),
  action("setLiquidGlass", { value: z.enum(["clear", "tinted"]) }),
  action("setColorFilter", {
    value: z.enum(["none", "grayscale", "red-green", "green-red", "blue-yellow"]),
  }),
  action("setOrientation", {
    value: z.enum(["portrait", "landscape_left", "portrait_upside_down", "landscape_right"]),
  }),
  action("setLocation", {
    latitude: z.number().min(-90).max(90),
    longitude: z.number().min(-180).max(180),
  }),
  action("clearLocation", {}),
  action("setPermission", {
    appId: AppId,
    permission: z.enum([
      "camera",
      "microphone",
      "photos",
      "contacts",
      "calendar",
      "reminders",
      "location",
      "notifications",
      "motion",
      "media-library",
      "faceid",
    ]),
    decision: z.enum(["grant", "revoke", "reset"]),
  }),
  action("openUrl", { url: TrimmedNonEmptyString }),
  action("launchApp", { appId: AppId }),
  action("terminateApp", { appId: AppId }),
  action("shake", {}),
  action("sendPush", {
    appId: AppId,
    payload: z.union([z.string(), z.record(z.string(), z.unknown())]),
  }),
]);
export type DeviceActionInput = z.input<typeof DeviceActionInput>;

export const DeviceEasAccount = z.looseObject({
  signedInAs: z.string(),
  credentialSource: forwardCompatibleLiteral(["settings", "env", "eas-login"]),
  apps: z.array(z.looseObject({ id: z.string(), fullName: z.string() })),
});
export type DeviceEasAccount = z.infer<typeof DeviceEasAccount>;

export const DeviceSimlockIdentity = z.looseObject({
  gatewayUrl: z.string(),
  /** The label that the gateway gave the token. */
  signedInAs: z.string(),
  tokenSource: forwardCompatibleLiteral(["entered", "settings", "env"]),
});
export type DeviceSimlockIdentity = z.infer<typeof DeviceSimlockIdentity>;

export const DeviceSummary = z.looseObject({
  hostId: z.string(),
  id: z.string(),
  platform: DevicePlatform,
  name: z.string(),
  version: z.string(),
  booted: z.boolean(),
  physical: z.boolean(),
});
export type DeviceSummary = z.infer<typeof DeviceSummary>;

const DeviceToolVersion = z.looseObject({
  requiredVersion: z.string(),
  installedVersions: z.array(z.string()),
  runningVersion: z.string().nullable(),
});

/** All kinds have the same fields, so one form reads them, and `kind` stays open. */
export const DeviceHostSummary = z.looseObject({
  id: z.string(),
  label: z.string(),
  kind: forwardCompatibleLiteral(["local", "ssh", "eas", "simlock"]),
  platforms: z.array(
    z.looseObject({
      platform: DevicePlatform,
      available: z.boolean(),
      reason: z.string().nullish(),
    }),
  ),
  tools: z.looseObject({ hub: DeviceToolVersion, agent: DeviceToolVersion }).nullish(),
  toolInspectionError: z.string().nullish(),
  hubInstalled: z.boolean(),
  agentDeviceInstalled: z.boolean(),
});
export type DeviceHostSummary = z.infer<typeof DeviceHostSummary>;

const DeviceHostStatus = forwardCompatibleLiteral([
  "disabled",
  "idle",
  "installing",
  "starting",
  "ready",
  "failed",
]);

export const DeviceSession = z.looseObject({
  threadId: ThreadId,
  hostId: z.string(),
  deviceId: z.string(),
  platform: DevicePlatform,
  openedAt: z.string(),
});
export type DeviceSession = z.infer<typeof DeviceSession>;

/**
 * The server sends EAS and Simlock hosts in `easHosts` and `simlockHosts`, so that an older
 * client still reads `hosts`. Decoded, as in the contract, every host is in `hosts`.
 */
export const DeviceServiceState = z
  .looseObject({
    supportsHostRetry: z.boolean().nullish(),
    supportsToolUpdate: z.boolean().nullish(),
    supportsToolInspection: z.boolean().nullish(),
    supportsEasHosts: z.boolean().nullish(),
    supportsSimlockHosts: z.boolean().nullish(),
    hostStatus: DeviceHostStatus,
    hostStatusDetail: z.string().nullish(),
    hostStatuses: z.record(
      z.string(),
      z.looseObject({
        status: DeviceHostStatus,
        detail: z.string().nullish(),
        androidDiscoveryIncomplete: z.boolean().nullish(),
        /** Platforms whose device discovery did not finish. */
        incompletePlatforms: z.array(DevicePlatform).nullish(),
      }),
    ),
    devices: z.array(DeviceSummary),
    sessions: z.array(DeviceSession),
    bootingDevices: z.array(DeviceSummary.extend({ threadId: ThreadId })).nullish(),
    onboardingCompleted: z.boolean(),
    agentAccessEnabled: z.boolean(),
    hubBasePath: z.string(),
    revision: z.number().int(),
    hosts: z.array(DeviceHostSummary),
    easHosts: z.array(DeviceHostSummary).nullish(),
    simlockHosts: z.array(DeviceHostSummary).nullish(),
  })
  .transform(({ easHosts, simlockHosts, ...state }) => ({
    ...state,
    hosts: [...state.hosts, ...(easHosts ?? []), ...(simlockHosts ?? [])],
  }));
export type DeviceServiceState = z.infer<typeof DeviceServiceState>;

const DeviceSettings = z.looseObject({
  appearance: forwardCompatibleLiteral(["light", "dark"]).nullish(),
  textSize: forwardCompatibleLiteral(["small", "default", "large", "extra-large"]).nullish(),
  reduceMotion: z.boolean().nullish(),
  increaseContrast: z.boolean().nullish(),
  reduceTransparency: z.boolean().nullish(),
  showBorders: z.boolean().nullish(),
  voiceOver: z.boolean().nullish(),
  liquidGlass: forwardCompatibleLiteral(["clear", "tinted"]).nullish(),
  colorFilter: forwardCompatibleLiteral([
    "none",
    "grayscale",
    "red-green",
    "green-red",
    "blue-yellow",
  ]).nullish(),
  networkEnabled: z.boolean().nullish(),
  location: z.looseObject({ latitude: z.number(), longitude: z.number() }).nullish(),
});

export const DeviceDetail = z.looseObject({
  hostId: z.string(),
  deviceId: z.string(),
  settings: DeviceSettings,
  foregroundApp: z
    .looseObject({
      id: z.string(),
      name: z.string().nullish(),
      version: z.string().nullish(),
    })
    .nullable(),
  readAt: z.string(),
});
export type DeviceDetail = z.infer<typeof DeviceDetail>;
