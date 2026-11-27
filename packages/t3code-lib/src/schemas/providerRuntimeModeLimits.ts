import { z } from "zod";
import {
  ProviderInstanceId,
  TrimmedNonEmptyString,
  forwardCompatibleArray,
  forwardCompatibleLiteral,
} from "./common.ts";
import { RuntimeMode } from "./orchestration/model.ts";

export const ProviderRuntimeModeLimitReason = forwardCompatibleLiteral([
  "managed-settings",
  "user-settings",
  "project-settings",
  "settings",
]);
export type ProviderRuntimeModeLimitReason = z.infer<typeof ProviderRuntimeModeLimitReason>;

export const ProviderRuntimeModeLimit = z.looseObject({
  mode: RuntimeMode,
  reason: ProviderRuntimeModeLimitReason,
});
export type ProviderRuntimeModeLimit = z.infer<typeof ProviderRuntimeModeLimit>;

export const ProviderRuntimeModeLimitsInput = z.looseObject({
  instanceId: ProviderInstanceId,
  cwd: TrimmedNonEmptyString,
});
export type ProviderRuntimeModeLimitsInput = z.infer<typeof ProviderRuntimeModeLimitsInput>;

export const ProviderRuntimeModeLimitsResult = z.looseObject({
  limits: forwardCompatibleArray(ProviderRuntimeModeLimit),
});
export type ProviderRuntimeModeLimitsResult = z.infer<typeof ProviderRuntimeModeLimitsResult>;
