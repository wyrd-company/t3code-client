// ---
// relationships:
//   implements: library
// ---
/**
 * Mirrors the wire shapes of `packages/contracts/src/managedPolicy.ts`: what a client learns
 * about the policy file that an administrator deploys on the server's machine. The file itself
 * (`ManagedPolicyDocument`) is read only by the server and the desktop app, so it is not here.
 * Unknown keys pass.
 */
import { z } from "zod";
import {
  ProviderDriverKind,
  TrimmedNonEmptyString,
  forwardCompatibleLiteral,
  stringRecord,
} from "./common.ts";
import { RuntimeMode } from "./provider.ts";

/** `auto` checks for updates and installs when a user asks. `off` never checks. */
export const ManagedUpdatesMode = forwardCompatibleLiteral(["auto", "off"]);
export type ManagedUpdatesMode = z.infer<typeof ManagedUpdatesMode>;

/** The update policy that clients see. The server leaves out the file's `feedUrl`. */
export const ManagedPolicySummaryUpdates = z.looseObject({
  mode: ManagedUpdatesMode,
  /** `false` makes the nightly channel unavailable. */
  allowNightly: z.boolean().optional(),
});
export type ManagedPolicySummaryUpdates = z.infer<typeof ManagedPolicySummaryUpdates>;

/** A kind of client the server may accept. */
export const ManagedPolicyClient = forwardCompatibleLiteral(["desktop", "local-browser", "remote"]);
export type ManagedPolicyClient = z.infer<typeof ManagedPolicyClient>;

export const ManagedPolicySummaryProviderLimits = z.looseObject({
  /** Only these drivers run. Absent means every driver is allowed. */
  allowedDrivers: z.array(ProviderDriverKind).min(1).optional(),
  /**
   * Per driver, the instance fields that users cannot change, as dot paths into the instance:
   * `config.binaryPath`, `config.launchArgs`, `environment.<NAME>`. A bare `environment`
   * means every variable.
   */
  lockedInstanceFields: stringRecord(z.array(z.string())).optional(),
});
export type ManagedPolicySummaryProviderLimits = z.infer<typeof ManagedPolicySummaryProviderLimits>;

/**
 * What the server enforces. A missing key means no limit. For the boolean capabilities only
 * `false` restricts.
 */
export const ManagedPolicySummaryLimits = z.looseObject({
  /** The broadest runtime mode that a thread may be created in, switched to or run turns in. */
  maxRuntimeMode: RuntimeMode.optional(),
  /** Clients the server accepts. Without `remote`, nothing off the server's machine can pair. */
  clients: z.array(ManagedPolicyClient).min(1).optional(),
  /** `false` also when `clients` leaves out `remote`, because T3 Connect is remote access. */
  connect: z.boolean().optional(),
  webhookTasks: z.boolean().optional(),
  telemetry: z.boolean().optional(),
  browserCookieImport: z.boolean().optional(),
  providers: ManagedPolicySummaryProviderLimits.optional(),
  updates: ManagedPolicySummaryUpdates.optional(),
});
export type ManagedPolicySummaryLimits = z.infer<typeof ManagedPolicySummaryLimits>;

/** Enough to explain a locked control. It carries no setting values. */
export const ManagedPolicySummary = z.looseObject({
  /** Shown to users as "Managed by <organization>". */
  organization: TrimmedNonEmptyString,
  supportUrl: TrimmedNonEmptyString.optional(),
  /** Dot paths into `ServerSettings` that users cannot change. */
  lockedSettings: z.array(z.string()),
  limits: ManagedPolicySummaryLimits.optional(),
});
export type ManagedPolicySummary = z.infer<typeof ManagedPolicySummary>;
