// ---
// relationships:
//   implements: library
// ---
/** Usage limit sources: hubs that report the usage limits of the accounts behind them. */
import { z } from "zod";
import {
  IsoDateTime,
  TrimmedNonEmptyString,
  forwardCompatibleArray,
  forwardCompatibleLiteral,
} from "./common.ts";
import { ServerProviderUsageLimits } from "./provider.ts";

export const UsageLimitSourceAccount = z.looseObject({
  id: TrimmedNonEmptyString,
  driver: TrimmedNonEmptyString,
  email: TrimmedNonEmptyString.optional(),
  plan: TrimmedNonEmptyString.optional(),
  workspaceId: TrimmedNonEmptyString.optional(),
  usageLimits: ServerProviderUsageLimits,
});
export type UsageLimitSourceAccount = z.infer<typeof UsageLimitSourceAccount>;
export const UsageLimitSourceSnapshot = z.looseObject({
  id: TrimmedNonEmptyString,
  kind: forwardCompatibleLiteral(["cliproxy"]),
  label: TrimmedNonEmptyString,
  /** Origin of the hub, which also serves the agents sent through it. */
  origin: TrimmedNonEmptyString.optional(),
  /** Origin and base path of the hub, which tell apart hubs served from one origin. */
  endpoint: TrimmedNonEmptyString.optional(),
  checkedAt: IsoDateTime,
  accounts: forwardCompatibleArray(UsageLimitSourceAccount),
  error: TrimmedNonEmptyString.optional(),
});
export type UsageLimitSourceSnapshot = z.infer<typeof UsageLimitSourceSnapshot>;
export const UsageLimitSourceSnapshots = forwardCompatibleArray(UsageLimitSourceSnapshot);
export type UsageLimitSourceSnapshots = z.infer<typeof UsageLimitSourceSnapshots>;
