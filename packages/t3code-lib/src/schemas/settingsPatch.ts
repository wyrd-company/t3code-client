// ---
// relationships:
//   implements: library
// ---
/**
 * The settings mutation. Mirrors `ServerSettingsPatch` in
 * `packages/contracts/src/settings.ts` and `ProviderInstanceMutation` in
 * `providerInstance.ts`. Every key is optional and has no default, so that a
 * patch sends only what the caller set. Lists are closed: a value of a newer
 * server goes through `rpc.callRaw`.
 */
import { z } from "zod";
import type { AuthEnvironmentScope } from "./auth.ts";
import { ProviderInstanceId, ProviderSlug, TrimmedNonEmptyString } from "./common.ts";
import { EasDeviceHosts, SimlockDeviceHosts, SshDeviceHosts } from "./deviceHosts.ts";
import { ModelSelection } from "./orchestration/model.ts";
import {
  ProviderInstanceConfig,
  ProviderInstanceMutation,
  SecretProviderConfig,
  SecretProviderSlug,
  UsageLimitSourceConfig,
} from "./providerInstance.ts";
import {
  BackgroundActivityOverrides,
  BackgroundActivityProfile,
  BranchNamingMode,
  EnvironmentMachineKind,
  IdleCompactionMode,
  Millis,
  ModelFavorite,
  ModelFavorites,
  ModelSelectionPatch,
  ProjectKey,
  ProjectScriptInput,
  ProjectSettingsOverride,
  ProviderModelPreferences,
  PullRequestMergeMethod,
  ResponseStreamingMode,
  RuntimeMode,
  SidebarAutoSettleAfterDays,
  SnoozePreset,
  StorageCleanupPatch,
  ThreadEnvMode,
  TrimmedString,
  UsageModelPriceOverride,
  WorktreeCleanupPatch,
  WorktreeSubmodules,
  WritingStylePatch,
} from "./settingsPatchFields.ts";

/** Keys that the server treats as provider management in place of a settings write. */
const PROVIDER_PATCH_KEYS: ReadonlySet<string> = new Set([
  "providerInstances",
  "usageLimitSources",
  "secretProviders",
]);

export const ServerSettingsPatch = z
  .looseObject({
    setModelFavorites: z.array(ModelFavorite.extend({ favorite: z.boolean() })),
    setModelsHidden: z.array(ModelFavorite.extend({ hidden: z.boolean() })),
    setProviderModelOrder: z.looseObject({
      provider: ProviderInstanceId,
      modelOrder: z.array(TrimmedString),
    }),
    favorites: ModelFavorites,
    providerModelPreferences: ProviderModelPreferences,
    /** Applied only while the server's preferences are still unset. */
    migrateModelPreferences: z
      .looseObject({
        favorites: ModelFavorites,
        providerModelPreferences: ProviderModelPreferences,
      })
      .partial(),
    worktreeCleanup: WorktreeCleanupPatch,
    storageCleanup: StorageCleanupPatch,
    worktreesDirectory: TrimmedString,
    responseStreamingMode: ResponseStreamingMode,
    enableProviderUpdateChecks: z.boolean(),
    continueThreadsAfterServerUpdate: z.boolean(),
    enableAgentBrowserAccess: z.boolean(),
    projectAgentBrowserAccessOverrides: z.record(ProjectKey, z.boolean().nullable()),
    defaultAutoPull: z.boolean(),
    defaultProjectScripts: z.array(ProjectScriptInput),
    projectScriptOverrides: z.record(ProjectKey, z.array(ProjectScriptInput).nullable()),
    projectAutoPullOverrides: z.record(ProjectKey, z.boolean().nullable()),
    defaultModelSelection: ModelSelection.nullable(),
    defaultRuntimeMode: RuntimeMode,
    fallbackModelSelection: ModelSelection.nullable(),
    /** Replaces each project's override set; null removes it. */
    projectSettingsOverrides: z.record(ProjectKey, ProjectSettingsOverride.nullable()),
    enableAgentDeviceAccess: z.boolean(),
    enableDeviceSupport: z.boolean(),
    deviceOnboardingCompleted: z.boolean(),
    deviceHosts: SshDeviceHosts,
    easDeviceHosts: EasDeviceHosts,
    simlockDeviceHosts: SimlockDeviceHosts,
    simlockDeviceHostsEnabled: z.boolean(),
    sidebarAutoSettleAfterDays: SidebarAutoSettleAfterDays.nullable(),
    /** The older form of `idleCompaction`. */
    compactIdleThreads: z.union([z.boolean(), IdleCompactionMode]),
    idleCompaction: IdleCompactionMode,
    sidebarAutoSettleKeepPullRequests: z.boolean(),
    sidebarAutoSettleOnMerge: z.boolean(),
    autoResumeLimitedThreads: z.boolean(),
    snoozeLimitedThreads: z.boolean(),
    snoozePresets: z.array(SnoozePreset).max(8),
    guestSharingEnabled: z.boolean(),
    linkedEnvironmentsEnabled: z.boolean(),
    backgroundActivity: z
      .looseObject({
        schemaVersion: z.literal(1),
        profile: z.enum(["balanced", "performance", "battery-saver", "custom"]),
        baseProfile: BackgroundActivityProfile,
        overrides: BackgroundActivityOverrides,
      })
      .partial(),
    automaticGitFetchInterval: Millis,
    providerHealthRefreshInterval: Millis,
    backgroundActivityProfile: BackgroundActivityProfile,
    environmentIcon: EnvironmentMachineKind.nullable(),
    defaultThreadEnvMode: ThreadEnvMode.nullable(),
    newWorktreesStartFromOrigin: z.boolean(),
    worktreeSubmodules: WorktreeSubmodules.nullable(),
    addProjectBaseDirectory: TrimmedString,
    textGenerationModelSelection: ModelSelectionPatch,
    threadTitleInstructions: TrimmedString,
    branchNamingMode: BranchNamingMode,
    branchNamePrefix: TrimmedString,
    branchNameInstructions: TrimmedString,
    removeAgentCreditsOnMerge: z.boolean(),
    sourceControlWritingStyle: WritingStylePatch,
    sourceControlWriterModelSelection: ModelSelection.nullable(),
    reviewGuidesEnabled: z.boolean(),
    reviewGuideModelSelection: ModelSelection.nullable(),
    reviewGuideInstructions: TrimmedString,
    pullRequestMergeMethod: PullRequestMergeMethod.nullable(),
    observability: z
      .looseObject({
        otlpTracesUrl: TrimmedString,
        otlpMetricsUrl: TrimmedString,
        otlpLogsUrl: TrimmedString,
      })
      .partial(),
    /** Merges per host. Redaction markers keep a secret; an empty or omitted secret removes it. */
    sourceControlHosts: z.record(z.string(), z.record(z.string(), z.unknown())),
    /** Replaces the whole map. `providerInstanceMutation` changes one instance. */
    providerInstances: z.record(ProviderSlug, ProviderInstanceConfig),
    /** Merges per source; null removes one. */
    usageLimitSources: z.record(z.string(), UsageLimitSourceConfig.nullable()),
    secretProviders: z.record(SecretProviderSlug, SecretProviderConfig.nullable()),
    cursorKeychainUsageEnabled: z.boolean(),
    usagePriceOverrides: z.record(TrimmedNonEmptyString, UsageModelPriceOverride.nullable()),
    usageModelAliases: z.record(TrimmedNonEmptyString, TrimmedNonEmptyString.nullable()),
  })
  .partial();
export type ServerSettingsPatch = z.infer<typeof ServerSettingsPatch>;

export const ServerUpdateSettingsInput = z.looseObject({
  patch: ServerSettingsPatch,
  providerInstanceMutation: ProviderInstanceMutation.optional(),
});
export type ServerUpdateSettingsInput = z.infer<typeof ServerUpdateSettingsInput>;

/**
 * The scopes the server requires, in its order: `settings:write` for any other
 * change or an empty patch with no mutation, `providers:manage` for provider
 * keys and a mutation. A key this build does not know counts for neither.
 */
export function requiredScopesForSettingsUpdate(
  input: ServerUpdateSettingsInput,
): readonly [AuthEnvironmentScope, ...AuthEnvironmentScope[]] {
  const keys = Object.entries(input.patch)
    .filter(([key, value]) => value !== undefined && Object.hasOwn(ServerSettingsPatch.shape, key))
    .map(([key]) => key);
  const changesProviders =
    input.providerInstanceMutation !== undefined ||
    keys.some((key) => PROVIDER_PATCH_KEYS.has(key));
  const changesSettings = keys.some((key) => !PROVIDER_PATCH_KEYS.has(key));
  if (!changesProviders) return ["settings:write"];
  return changesSettings ? ["settings:write", "providers:manage"] : ["providers:manage"];
}
