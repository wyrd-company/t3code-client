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
import { ProjectScript } from "./projects.ts";
import { ProviderOptionSelections } from "./provider.ts";
import {
  ProviderInstanceConfig,
  ProviderInstanceMutation,
  SecretProviderConfig,
  SecretProviderSlug,
  UsageLimitSourceConfig,
} from "./providerInstance.ts";

const TrimmedString = z.string().trim();
const ProjectKey = TrimmedNonEmptyString;
const Millis = z.number();
const int = (minimum: number, maximum: number) => z.number().int().min(minimum).max(maximum);

const RuntimeMode = z.enum(["approval-required", "auto-accept-edits", "auto", "full-access"]);
const ThreadEnvMode = z.enum(["local", "worktree"]);
const WorktreeSubmodules = z.enum(["recursive", "top-level", "none"]);
const WorktreeKeepWhen = z.enum(["any-local-files", "uncommitted-changes", "tracked-changes"]);
const ResponseStreamingMode = z.enum(["turn", "paragraph"]);
const IdleCompactionMode = z.enum(["onReturn", "beforeCacheExpires", "off"]);
const BranchNamingMode = z.enum(["static", "semantic", "custom"]);
const PullRequestMergeMethod = z.enum(["merge", "squash", "rebase"]);
const BackgroundActivityProfile = z.enum(["balanced", "performance", "battery-saver"]);
const SourceControlWritingStyleMode = z.enum([
  "repo_conventions",
  "conventional_commits",
  "custom",
]);
const EnvironmentMachineKind = z.enum([
  "server",
  "cloud",
  "linux",
  "desktop",
  "laptop",
  "mac-mini",
  "mac-studio",
]);

const StorageRetentionDays = int(1, 3650).nullable();
const SettledWorktreeRetentionDays = int(0, 3650).nullable();
const SidebarAutoSettleAfterDays = z.number().min(1).max(90);

const ProjectScriptInput = ProjectScript.extend({
  icon: z.enum(["play", "test", "lint", "configure", "build", "debug"]),
});

const ModelFavorite = z.looseObject({
  provider: ProviderInstanceId,
  model: TrimmedNonEmptyString,
});
const ModelFavorites = z.array(ModelFavorite);
const ProviderModelPreferences = z.record(
  ProviderSlug,
  z.looseObject({
    hiddenModels: z.array(z.string()).optional(),
    modelOrder: z.array(z.string()).optional(),
  }),
);
const ModelSelectionPatch = z
  .looseObject({
    instanceId: ProviderInstanceId,
    model: TrimmedNonEmptyString,
    options: ProviderOptionSelections,
  })
  .partial();

const WORKTREE_RULE_FIELDS = {
  worktreeKeepWhen: WorktreeKeepWhen,
  worktreeAfterDays: StorageRetentionDays,
  worktreeSettledAfterDays: SettledWorktreeRetentionDays,
  worktreeOnMerge: z.boolean(),
  worktreeOnDelete: z.boolean(),
  worktreeUnchanged: z.boolean(),
};
const WorktreeCleanupPatch = z
  .discriminatedUnion("mode", [
    z.looseObject({ mode: z.literal("off") }),
    z.looseObject({
      mode: z.literal("custom"),
      rules: z.looseObject(WORKTREE_RULE_FIELDS).partial(),
    }),
  ])
  .nullable();
/** A project's override replaces the whole setting, so its rules are whole. */
const WorktreeCleanupOverride = z
  .discriminatedUnion("mode", [
    z.looseObject({ mode: z.literal("off") }),
    z.looseObject({
      mode: z.literal("custom"),
      rules: z.looseObject({
        worktreeKeepWhen: WorktreeKeepWhen.optional(),
        worktreeAfterDays: StorageRetentionDays,
        worktreeSettledAfterDays: SettledWorktreeRetentionDays.optional(),
        worktreeOnMerge: z.boolean(),
        worktreeOnDelete: z.boolean(),
        worktreeUnchanged: z.boolean(),
      }),
    }),
  ])
  .nullable();
const StorageCleanupPatch = z
  .looseObject({
    ...WORKTREE_RULE_FIELDS,
    browserArtifactsAfterDays: StorageRetentionDays,
    logsAfterDays: StorageRetentionDays,
  })
  .partial();

const SnoozePreset = z.discriminatedUnion("kind", [
  z.looseObject({ kind: z.literal("after"), minutes: int(1, 30 * 24 * 60) }),
  z.looseObject({
    kind: z.literal("at"),
    day: z.enum([
      "today",
      "tomorrow",
      "monday",
      "tuesday",
      "wednesday",
      "thursday",
      "friday",
      "saturday",
      "sunday",
    ]),
    time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
  }),
]);

const BackgroundActivityOverrides = z
  .looseObject({
    automaticGitFetchInterval: Millis,
    providerHealthRefreshInterval: Millis,
    hostPowerMonitorActiveInterval: Millis,
    hostPowerMonitorIdleInterval: Millis,
    pauseWhenHostLocked: z.boolean(),
    pauseWhenHostLowPower: z.boolean(),
    pauseWhenClientLowPower: z.boolean(),
    pauseWhenOnBattery: z.boolean(),
  })
  .partial();

const WritingStylePatch = z
  .looseObject({
    mode: SourceControlWritingStyleMode,
    customInstructions: TrimmedString,
    followChangeRequestTemplates: z.boolean(),
  })
  .partial();

/** Absent keys inherit; null is a value for nullable settings. */
const ProjectSettingsOverride = z
  .looseObject({
    worktreeCleanup: WorktreeCleanupOverride,
    defaultModelSelection: ModelSelection.nullable(),
    defaultRuntimeMode: RuntimeMode,
    defaultThreadEnvMode: ThreadEnvMode,
    newWorktreesStartFromOrigin: z.boolean(),
    worktreeSubmodules: WorktreeSubmodules,
    defaultAutoPull: z.boolean(),
    defaultProjectScripts: z.array(ProjectScriptInput),
    enableAgentBrowserAccess: z.boolean(),
    enableAgentDeviceAccess: z.boolean(),
    textGenerationModelSelection: ModelSelection,
    threadTitleInstructions: TrimmedString,
    sourceControlWriterModelSelection: ModelSelection.nullable(),
    reviewGuideModelSelection: ModelSelection.nullable(),
    reviewGuideInstructions: TrimmedString,
    sourceControlWritingStyle: WritingStylePatch,
    removeAgentCreditsOnMerge: z.boolean(),
    branchNamingMode: BranchNamingMode,
    branchNamePrefix: TrimmedString,
    branchNameInstructions: TrimmedString,
    pullRequestMergeMethod: PullRequestMergeMethod.nullable(),
    sidebarAutoSettleOnMerge: z.boolean(),
    sidebarAutoSettleAfterDays: SidebarAutoSettleAfterDays.nullable(),
    sidebarAutoSettleKeepPullRequests: z.boolean(),
    continueThreadsAfterServerUpdate: z.boolean(),
    responseStreamingMode: ResponseStreamingMode,
    providerInstances: z.record(ProviderSlug, z.looseObject({ enabled: z.boolean().optional() })),
  })
  .partial();

const UsageTokenPrice = z.number().min(0);
const UsageModelPriceOverride = z.looseObject({
  inputCostPerMillionTokens: UsageTokenPrice,
  outputCostPerMillionTokens: UsageTokenPrice,
  cacheReadCostPerMillionTokens: UsageTokenPrice.optional(),
  cacheWriteCostPerMillionTokens: UsageTokenPrice.optional(),
});

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
