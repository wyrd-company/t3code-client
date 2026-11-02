// ---
// relationships:
//   implements: library
// ---
/**
 * Mirrors `packages/contracts/src/sourceControl.ts`: which version control
 * systems and source control hosts the server can use. `version`, `detail`,
 * `account` and `host` are Effect `Option` values, which arrive as tagged records.
 */
import { z } from "zod";
import {
  TrimmedNonEmptyString,
  effectOption,
  forwardCompatibleArray,
  forwardCompatibleLiteral,
} from "./common.ts";

const OptionalText = effectOption(TrimmedNonEmptyString);

export const SourceControlDiscoveryStatus = forwardCompatibleLiteral(["available", "missing"]);
export type SourceControlDiscoveryStatus = z.infer<typeof SourceControlDiscoveryStatus>;

export const SourceControlProviderAuthStatus = forwardCompatibleLiteral([
  "authenticated",
  "unauthenticated",
  "unknown",
]);
export type SourceControlProviderAuthStatus = z.infer<typeof SourceControlProviderAuthStatus>;

export const SourceControlProviderAuth = z.looseObject({
  status: SourceControlProviderAuthStatus,
  account: OptionalText,
  host: OptionalText,
  detail: OptionalText,
  accounts: z
    .array(
      z.looseObject({
        host: TrimmedNonEmptyString,
        account: TrimmedNonEmptyString,
        active: z.boolean(),
        authenticated: z.boolean(),
        error: TrimmedNonEmptyString.optional(),
        /** Set when the login comes from a token variable, which wins over Settings. */
        environmentVariable: TrimmedNonEmptyString.optional(),
      }),
    )
    .optional(),
});
export type SourceControlProviderAuth = z.infer<typeof SourceControlProviderAuth>;

const DISCOVERY_FIELDS = {
  label: TrimmedNonEmptyString,
  executable: TrimmedNonEmptyString.optional(),
  status: SourceControlDiscoveryStatus,
  version: OptionalText,
  installHint: TrimmedNonEmptyString,
  detail: OptionalText,
};

export const VcsDiscoveryItem = z.looseObject({
  kind: z.string(),
  implemented: z.boolean(),
  ...DISCOVERY_FIELDS,
});
export type VcsDiscoveryItem = z.infer<typeof VcsDiscoveryItem>;

export const SourceControlProviderDiscoveryItem = z.looseObject({
  kind: z.string(),
  ...DISCOVERY_FIELDS,
  auth: SourceControlProviderAuth,
  /** The server signs in through the host's app; clients offer it only then. */
  appSignIn: z.boolean().optional(),
});
export type SourceControlProviderDiscoveryItem = z.infer<typeof SourceControlProviderDiscoveryItem>;

export const SourceControlDiscoveryResult = z.looseObject({
  versionControlSystems: forwardCompatibleArray(VcsDiscoveryItem),
  sourceControlProviders: forwardCompatibleArray(SourceControlProviderDiscoveryItem),
});
export type SourceControlDiscoveryResult = z.infer<typeof SourceControlDiscoveryResult>;
