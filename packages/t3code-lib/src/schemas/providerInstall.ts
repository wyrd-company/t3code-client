// ---
// relationships:
//   implements: library
// ---
/**
 * The server-managed install of a provider's executable. Mirrors `providerSetup.ts`
 * in the contracts. An input has the contracts' bounds. A result stays open, so a
 * newer server's values decode.
 */
import { z } from "zod";
import {
  NonNegativeInt,
  ProviderDriverKind,
  ProviderInstanceId,
  TrimmedNonEmptyString,
  forwardCompatibleLiteral,
} from "./common.ts";

export const ProviderInstallState = z.looseObject({
  driver: ProviderDriverKind,
  operationId: TrimmedNonEmptyString.nullable(),
  phase: forwardCompatibleLiteral([
    "idle",
    "downloading",
    "extracting",
    "verifying",
    "succeeded",
    "failed",
    "cancelled",
  ]),
  downloadedBytes: NonNegativeInt,
  totalBytes: NonNegativeInt.nullable(),
  version: TrimmedNonEmptyString.nullable(),
  installedVersion: TrimmedNonEmptyString.nullable(),
  executablePath: TrimmedNonEmptyString.nullable().optional(),
  source: forwardCompatibleLiteral(["managed", "local"]).nullable().optional(),
  canRemove: z.boolean(),
  message: z.string().nullable(),
});
export type ProviderInstallState = z.infer<typeof ProviderInstallState>;

export const ProviderInstallCancelInput = z.looseObject({
  instanceId: ProviderInstanceId,
  operationId: TrimmedNonEmptyString.max(128),
});
export type ProviderInstallCancelInput = z.infer<typeof ProviderInstallCancelInput>;
