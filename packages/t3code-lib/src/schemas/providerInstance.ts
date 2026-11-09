// ---
// relationships:
//   implements: library
// ---
/**
 * Provider instances, usage limit sources and secret providers as a settings
 * write sends them. Mirrors `providerInstance.ts`, `secretReference.ts` and
 * `settings.ts` in the contracts.
 */
import { z } from "zod";
import { ProviderDriverKind, ProviderInstanceId, TrimmedNonEmptyString } from "./common.ts";

const TrimmedString = z.string().trim();
export const SecretProviderSlug = TrimmedNonEmptyString.max(64).regex(
  /^[a-zA-Z0-9][a-zA-Z0-9_-]*$/,
);

export const SecretReference = z.looseObject({
  provider: SecretProviderSlug,
  reference: TrimmedNonEmptyString.max(1024).regex(/^[^\r\n]+$/),
});
export type SecretReference = z.infer<typeof SecretReference>;

/**
 * A credential setting: the literal, which the server keeps in its secret
 * store and redacts for clients, or the secret provider reference to read it
 * from, which the server stores and shows as written.
 */
export const SettingsSecretValue = z.union([TrimmedString, SecretReference]);
export type SettingsSecretValue = z.infer<typeof SettingsSecretValue>;

/** The wire form: a reference goes in `secret`, beside an empty or omitted `value`. */
const ProviderInstanceEnvironmentVariable = z.looseObject({
  name: TrimmedNonEmptyString.max(128).regex(/^[a-zA-Z_][a-zA-Z0-9_]*$/),
  value: z.string().optional(),
  sensitive: z.boolean().optional(),
  valueRedacted: z.boolean().optional(),
  secret: SecretReference.optional(),
});

export const ProviderInstanceConfig = z.looseObject({
  driver: ProviderDriverKind,
  displayName: TrimmedNonEmptyString.optional(),
  accentColor: TrimmedNonEmptyString.optional(),
  environment: z.array(ProviderInstanceEnvironmentVariable).optional(),
  enabled: z.boolean().optional(),
  /** Each driver decodes its own. */
  config: z.unknown().optional(),
});
export type ProviderInstanceConfig = z.infer<typeof ProviderInstanceConfig>;

export const ProviderInstanceMutation = z.discriminatedUnion("operation", [
  z.looseObject({
    operation: z.literal("create"),
    instanceId: ProviderInstanceId,
    instance: ProviderInstanceConfig,
  }),
  z.looseObject({
    operation: z.literal("upsert"),
    instanceId: ProviderInstanceId,
    instance: ProviderInstanceConfig,
  }),
  z.looseObject({
    operation: z.literal("remove"),
    instanceId: ProviderInstanceId,
  }),
]);
export type ProviderInstanceMutation = z.infer<typeof ProviderInstanceMutation>;

export const UsageLimitSourceConfig = z.looseObject({
  kind: z.literal("cliproxy"),
  label: TrimmedNonEmptyString.optional(),
  url: TrimmedNonEmptyString,
  managementKey: SettingsSecretValue.optional(),
  enabled: z.boolean().optional(),
});
export const SecretProviderConfig = z.looseObject({
  kind: SecretProviderSlug,
  label: TrimmedNonEmptyString.max(64),
  /** Each secret provider decodes its own. */
  config: z.unknown().optional(),
});
