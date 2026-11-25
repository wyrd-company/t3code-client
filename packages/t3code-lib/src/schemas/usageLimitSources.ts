// ---
// relationships:
//   implements: library
// ---
/** Usage limit sources: hubs that report the usage limits of the accounts behind them. */
import { z } from "zod";
import {
  IsoDateTime,
  ProviderInstanceId,
  TrimmedNonEmptyString,
  forwardCompatibleArray,
  forwardCompatibleLiteral,
} from "./common.ts";
import { ServerProviderUsageLimits, ServerProviderUsageWindow } from "./provider.ts";

export const UsageLimitSourceAccount = z.looseObject({
  id: TrimmedNonEmptyString,
  driver: TrimmedNonEmptyString,
  email: TrimmedNonEmptyString.optional(),
  plan: TrimmedNonEmptyString.optional(),
  workspaceId: TrimmedNonEmptyString.optional(),
  /** The models the hub routes to this account. */
  models: z.array(TrimmedNonEmptyString).optional(),
  usageLimits: ServerProviderUsageLimits,
});
export type UsageLimitSourceAccount = z.infer<typeof UsageLimitSourceAccount>;
/** One account of an `http` usage limit source, as its quota endpoint reports it. */
export const HttpQuotaAccount = z.looseObject({
  id: TrimmedNonEmptyString,
  label: TrimmedNonEmptyString,
  providerInstanceId: ProviderInstanceId.optional(),
  windows: z.array(
    z.looseObject({
      id: ServerProviderUsageWindow.shape.id,
      kind: ServerProviderUsageWindow.shape.kind,
      label: ServerProviderUsageWindow.shape.label,
      usedPercent: ServerProviderUsageWindow.shape.usedPercent,
      resetsAt: ServerProviderUsageWindow.shape.resetsAt,
    }),
  ),
});
export type HttpQuotaAccount = z.infer<typeof HttpQuotaAccount>;

export const UsageLimitSourceSnapshot = z.looseObject({
  id: TrimmedNonEmptyString,
  kind: forwardCompatibleLiteral(["cliproxy", "http"]),
  label: TrimmedNonEmptyString,
  /** Origin of the hub, which also serves the agents sent through it. */
  origin: TrimmedNonEmptyString.optional(),
  /** Origin and base path of the hub, which tell apart hubs served from one origin. */
  endpoint: TrimmedNonEmptyString.optional(),
  checkedAt: IsoDateTime,
  accounts: forwardCompatibleArray(UsageLimitSourceAccount),
  /** The accounts an `http` source reports, each with its usage windows. */
  quotaAccounts: forwardCompatibleArray(HttpQuotaAccount).optional(),
  error: TrimmedNonEmptyString.optional(),
});
export type UsageLimitSourceSnapshot = z.infer<typeof UsageLimitSourceSnapshot>;
export const UsageLimitSourceSnapshots = forwardCompatibleArray(UsageLimitSourceSnapshot);
export type UsageLimitSourceSnapshots = z.infer<typeof UsageLimitSourceSnapshots>;
