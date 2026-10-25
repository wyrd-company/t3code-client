/**
 * Mirrors of the `packages/contracts/src/providerRuntime.ts` types that the
 * orchestration read model carries: token usage and tool-activity labels.
 */
import { z } from "zod";
import {
  NonNegativeInt,
  PositiveInt,
  TrimmedNonEmptyString,
  forwardCompatibleLiteral,
  taggedUnionWithUnknown,
} from "../common.ts";

export const ThreadTokenUsageSnapshot = z.looseObject({
  usedTokens: NonNegativeInt,
  totalProcessedTokens: NonNegativeInt.optional(),
  maxTokens: PositiveInt.optional(),
  inputTokens: NonNegativeInt.optional(),
  cachedInputTokens: NonNegativeInt.optional(),
  outputTokens: NonNegativeInt.optional(),
  reasoningOutputTokens: NonNegativeInt.optional(),
  lastUsedTokens: NonNegativeInt.optional(),
  lastInputTokens: NonNegativeInt.optional(),
  lastCachedInputTokens: NonNegativeInt.optional(),
  lastOutputTokens: NonNegativeInt.optional(),
  lastReasoningOutputTokens: NonNegativeInt.optional(),
  toolUses: NonNegativeInt.optional(),
  durationMs: NonNegativeInt.optional(),
  compactsAutomatically: z.boolean().optional(),
  autoCompactThreshold: PositiveInt.optional(),
  cost: z
    .looseObject({
      amount: z.number(),
      currency: TrimmedNonEmptyString.max(32),
    })
    .optional(),
});
export type ThreadTokenUsageSnapshot = z.infer<typeof ThreadTokenUsageSnapshot>;

/**
 * Normalized main-agent usage for one turn. `complete` means the provider
 * supplied full input and output totals; `partial` means every included
 * count is valid but the full total is not known.
 */
export const TurnTokenUsage = z.looseObject({
  usageScope: z.literal("main_agent"),
  usageStatus: forwardCompatibleLiteral(["complete", "partial", "unavailable"]),
  inputTokens: NonNegativeInt.optional(),
  outputTokens: NonNegativeInt.optional(),
  cachedInputTokens: NonNegativeInt.optional(),
  cacheCreationTokens: NonNegativeInt.optional(),
  reasoningTokens: NonNegativeInt.optional(),
  hasSubagents: z.boolean(),
});
export type TurnTokenUsage = z.infer<typeof TurnTokenUsage>;

export const ToolActivitySurface = forwardCompatibleLiteral(["browser", "computer"]);
export type ToolActivitySurface = z.infer<typeof ToolActivitySurface>;

export const ToolActivityNativeAppReference = taggedUnionWithUnknown("_tag", [
  z.looseObject({
    _tag: z.literal("app-id"),
    appId: TrimmedNonEmptyString.max(512).regex(/^[A-Za-z0-9._-]+$/u),
  }),
  z.looseObject({
    _tag: z.literal("display-name"),
    displayName: TrimmedNonEmptyString.max(160),
  }),
]);
export type ToolActivityNativeAppReference = z.infer<typeof ToolActivityNativeAppReference>;

export const ToolActivityIcon = taggedUnionWithUnknown("_tag", [
  z.looseObject({
    _tag: z.literal("website"),
    pageUrl: TrimmedNonEmptyString.max(4096),
    faviconUrl: TrimmedNonEmptyString.max(4096).optional(),
    faviconUrlDark: TrimmedNonEmptyString.max(4096).optional(),
  }),
  z.looseObject({
    _tag: z.literal("native-app"),
    app: ToolActivityNativeAppReference,
  }),
  z.looseObject({
    _tag: z.literal("themed-logo"),
    logoUrl: TrimmedNonEmptyString.max(4096),
    logoUrlDark: TrimmedNonEmptyString.max(4096).optional(),
  }),
]);
export type ToolActivityIcon = z.infer<typeof ToolActivityIcon>;

export const ToolActivitySource = z.looseObject({
  key: TrimmedNonEmptyString.max(512),
  name: TrimmedNonEmptyString.max(160),
  kind: forwardCompatibleLiteral(["browser", "computer", "integration"]),
  icon: ToolActivityIcon.optional(),
});
export type ToolActivitySource = z.infer<typeof ToolActivitySource>;
