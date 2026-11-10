// ---
// relationships:
//   implements: library
// ---
/** The device hosts a settings patch can write. Mirrors `packages/contracts/src/device.ts`. */
import { z } from "zod";
import { TrimmedNonEmptyString } from "./common.ts";
import { SettingsSecretValue } from "./providerInstance.ts";

const int = (minimum: number, maximum: number) => z.number().int().min(minimum).max(maximum);

const DeviceHostId = TrimmedNonEmptyString.max(128)
  .regex(/^[a-zA-Z0-9][a-zA-Z0-9_-]*$/)
  .refine((id) => id !== "local", "The local host id is reserved.");
const uniqueHostIds = <Host extends { readonly id: string }>(hosts: readonly Host[]) =>
  new Set(hosts.map((host) => host.id)).size === hosts.length;
const UNIQUE_HOSTS = "Device host ids must be unique.";

export const SshDeviceHost = z.looseObject({
  kind: z.literal("ssh").optional(),
  id: DeviceHostId,
  label: TrimmedNonEmptyString,
  target: TrimmedNonEmptyString.regex(/^[^\s-][^\s]*$/),
  identityFile: TrimmedNonEmptyString.optional(),
  port: int(1, 65535).optional(),
});
const EasDeviceHost = z
  .looseObject({
    kind: z.literal("eas"),
    id: DeviceHostId,
    label: TrimmedNonEmptyString,
    appId: TrimmedNonEmptyString.optional(),
    accessToken: SettingsSecretValue.optional(),
    maxSessionMinutes: int(1, 115).optional(),
    idleMinutes: int(1, 60).optional(),
    maxConcurrentSessions: int(1, 20).optional(),
  })
  // The server's defaults are 10 and 30.
  .refine(
    (host) => (host.idleMinutes ?? 10) < (host.maxSessionMinutes ?? 30),
    "Idle minutes must be smaller than session minutes.",
  );
const SimlockDeviceHost = z.looseObject({
  kind: z.literal("simlock"),
  id: DeviceHostId,
  label: TrimmedNonEmptyString,
  gatewayUrl: TrimmedNonEmptyString.regex(/^https?:\/\/[^\s/]+\/?$/),
  /** Kept in the secret store, or the secret provider reference to read it from. */
  agentToken: SettingsSecretValue.optional(),
  maxLeases: int(1, 20).optional(),
  maxLeaseMinutes: int(5, 240).optional(),
});

export const SshDeviceHosts = z.array(SshDeviceHost).refine(uniqueHostIds, UNIQUE_HOSTS);
export const EasDeviceHosts = z.array(EasDeviceHost).refine(uniqueHostIds, UNIQUE_HOSTS);
export const SimlockDeviceHosts = z.array(SimlockDeviceHost).refine(uniqueHostIds, UNIQUE_HOSTS);
