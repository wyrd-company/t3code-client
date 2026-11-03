// ---
// relationships:
//   implements: library
// ---
/**
 * The nested shapes of the settings mutation in `settingsPatch.ts`. Mirrors
 * `ServerSettingsPatch` in `packages/contracts/src/settings.ts`. Lists are closed.
 */
import { z } from "zod";
import { ProviderInstanceId, ProviderSlug, TrimmedNonEmptyString } from "./common.ts";
import { ModelSelection } from "./orchestration/model.ts";
import { ProjectScript } from "./projects.ts";
import { ProviderOptionSelections } from "./provider.ts";

export const TrimmedString = z.string().trim();
export const ProjectKey = TrimmedNonEmptyString;
export const Millis = z.number();
const int = (minimum: number, maximum: number) => z.number().int().min(minimum).max(maximum);

export const RuntimeMode = z.enum([
  "approval-required",
  "auto-accept-edits",
  "auto",
  "full-access",
]);
export const ThreadEnvMode = z.enum(["local", "worktree"]);
export const WorktreeSubmodules = z.enum(["recursive", "top-level", "none"]);
const WorktreeKeepWhen = z.enum(["any-local-files", "uncommitted-changes", "tracked-changes"]);
export const ResponseStreamingMode = z.enum(["turn", "paragraph"]);
export const IdleCompactionMode = z.enum(["onReturn", "beforeCacheExpires", "off"]);
export const BranchNamingMode = z.enum(["static", "semantic", "custom"]);
export const PullRequestMergeMethod = z.enum(["merge", "squash", "rebase"]);
export const BackgroundActivityProfile = z.enum(["balanced", "performance", "battery-saver"]);
const SourceControlWritingStyleMode = z.enum([
  "repo_conventions",
  "conventional_commits",
  "custom",
]);
export const EnvironmentMachineKind = z.enum([
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
export const SidebarAutoSettleAfterDays = z.number().min(1).max(90);

export const ProjectScriptInput = ProjectScript.extend({
  icon: z.enum(["play", "test", "lint", "configure", "build", "debug"]),
});

export const ModelFavorite = z.looseObject({
  provider: ProviderInstanceId,
  model: TrimmedNonEmptyString,
});
export const ModelFavorites = z.array(ModelFavorite);
export const ProviderModelPreferences = z.record(
  ProviderSlug,
  z.looseObject({
    hiddenModels: z.array(z.string()).optional(),
    modelOrder: z.array(z.string()).optional(),
  }),
);
export const ModelSelectionPatch = z
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
export const WorktreeCleanupPatch = z
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
        ...WORKTREE_RULE_FIELDS,
        worktreeKeepWhen: WorktreeKeepWhen.optional(),
        worktreeSettledAfterDays: SettledWorktreeRetentionDays.optional(),
      }),
    }),
  ])
  .nullable();
export const StorageCleanupPatch = z
  .looseObject({
    ...WORKTREE_RULE_FIELDS,
    browserArtifactsAfterDays: StorageRetentionDays,
    logsAfterDays: StorageRetentionDays,
  })
  .partial();

export const SnoozePreset = z.discriminatedUnion("kind", [
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

export const BackgroundActivityOverrides = z
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

export const WritingStylePatch = z
  .looseObject({
    mode: SourceControlWritingStyleMode,
    customInstructions: TrimmedString,
    followChangeRequestTemplates: z.boolean(),
  })
  .partial();

/** Absent keys inherit; null is a value for nullable settings. */
export const ProjectSettingsOverride = z
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
export const UsageModelPriceOverride = z.looseObject({
  inputCostPerMillionTokens: UsageTokenPrice,
  outputCostPerMillionTokens: UsageTokenPrice,
  cacheReadCostPerMillionTokens: UsageTokenPrice.optional(),
  cacheWriteCostPerMillionTokens: UsageTokenPrice.optional(),
});
