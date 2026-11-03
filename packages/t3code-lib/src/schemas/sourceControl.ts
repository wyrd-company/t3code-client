// ---
// relationships:
//   implements: library
// ---
/**
 * Mirrors `packages/contracts/src/sourceControl.ts`: which version control
 * systems and source control hosts the server can use, and the repository and
 * sign-in methods. `version`, `detail`, `account` and `host` are Effect `Option`
 * values, which arrive as tagged records. An input has the contracts' closed
 * values. A result stays open, so a newer server's values decode.
 */
import { z } from "zod";
import {
  TrimmedNonEmptyString,
  effectOption,
  forwardCompatibleArray,
  forwardCompatibleLiteral,
} from "./common.ts";
import { SourceControlProviderKind } from "./vcs.ts";

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

export const SourceControlCloneProtocol = z.enum(["auto", "ssh", "https"]);
export type SourceControlCloneProtocol = z.infer<typeof SourceControlCloneProtocol>;

export const SourceControlRepositoryVisibility = z.enum(["private", "public"]);
export type SourceControlRepositoryVisibility = z.infer<typeof SourceControlRepositoryVisibility>;

export const SourceControlRepositoryInfo = z.looseObject({
  provider: SourceControlProviderKind,
  nameWithOwner: TrimmedNonEmptyString,
  url: TrimmedNonEmptyString,
  sshUrl: TrimmedNonEmptyString,
});
export type SourceControlRepositoryInfo = z.infer<typeof SourceControlRepositoryInfo>;

export const SourceControlRepositoryLookupInput = z.looseObject({
  provider: SourceControlProviderKind,
  repository: TrimmedNonEmptyString,
  cwd: TrimmedNonEmptyString.optional(),
});
export type SourceControlRepositoryLookupInput = z.infer<typeof SourceControlRepositoryLookupInput>;

/** The source of a clone: `provider` with `repository`, or `remoteUrl`. */
export const SourceControlCloneSourceFields = {
  provider: SourceControlProviderKind.optional(),
  repository: TrimmedNonEmptyString.optional(),
  remoteUrl: TrimmedNonEmptyString.optional(),
  destinationPath: TrimmedNonEmptyString,
  protocol: SourceControlCloneProtocol.optional(),
};

export const SourceControlCloneRepositoryInput = z.looseObject(SourceControlCloneSourceFields);
export type SourceControlCloneRepositoryInput = z.infer<typeof SourceControlCloneRepositoryInput>;

/** `remoteUrl` has no credentials. `repository` is `null` for a clone from a URL. */
export const SourceControlCloneRepositoryResult = z.looseObject({
  cwd: TrimmedNonEmptyString,
  remoteUrl: TrimmedNonEmptyString,
  repository: SourceControlRepositoryInfo.nullable(),
});
export type SourceControlCloneRepositoryResult = z.infer<typeof SourceControlCloneRepositoryResult>;

export const SourceControlPublishRepositoryInput = z.looseObject({
  cwd: TrimmedNonEmptyString,
  provider: SourceControlProviderKind,
  repository: TrimmedNonEmptyString,
  visibility: SourceControlRepositoryVisibility,
  remoteName: TrimmedNonEmptyString.optional(),
  protocol: SourceControlCloneProtocol.optional(),
});
export type SourceControlPublishRepositoryInput = z.infer<
  typeof SourceControlPublishRepositoryInput
>;

/** `status` is `remote_added` when the repository has no commit to push. */
export const SourceControlPublishRepositoryResult = z.looseObject({
  repository: SourceControlRepositoryInfo,
  remoteName: TrimmedNonEmptyString,
  remoteUrl: TrimmedNonEmptyString,
  branch: TrimmedNonEmptyString,
  status: forwardCompatibleLiteral(["pushed", "remote_added"]),
});
export type SourceControlPublishRepositoryResult = z.infer<
  typeof SourceControlPublishRepositoryResult
>;

export const SourceControlSignInInput = z.looseObject({
  provider: SourceControlProviderKind,
  host: TrimmedNonEmptyString,
});
export type SourceControlSignInInput = z.infer<typeof SourceControlSignInInput>;

/** A device-flow code the user enters at `verificationUri` in any browser. */
export const SourceControlSignInPrompt = z.looseObject({
  userCode: TrimmedNonEmptyString,
  verificationUri: TrimmedNonEmptyString,
  expiresAt: z.number(),
});
export type SourceControlSignInPrompt = z.infer<typeof SourceControlSignInPrompt>;

export const SourceControlSignInResult = z.looseObject({ account: TrimmedNonEmptyString });
export type SourceControlSignInResult = z.infer<typeof SourceControlSignInResult>;

export const SourceControlRepositoryAccessInput = z.looseObject({
  provider: SourceControlProviderKind,
  host: TrimmedNonEmptyString,
  repository: TrimmedNonEmptyString,
});
export type SourceControlRepositoryAccessInput = z.infer<typeof SourceControlRepositoryAccessInput>;

/** Whether the server's forge app sign-in reaches a repository; `signed-out` when not in use. */
export const SourceControlAppAccess = z.looseObject({
  status: forwardCompatibleLiteral(["covered", "not-covered", "signed-out"]),
});
export type SourceControlAppAccess = z.infer<typeof SourceControlAppAccess>;
