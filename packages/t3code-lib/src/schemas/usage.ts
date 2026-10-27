// ---
// relationships:
//   implements: library
// ---
/**
 * Mirrors `packages/contracts/src/usage.ts`: historical token usage and cost
 * read from provider transcripts, bucketed by day or hour. Buckets and
 * sources keep their own provenance; reasoning tokens are a subset of
 * output tokens, and bucket session counts overlap across buckets.
 */
import { z } from "zod";
import {
  NonNegativeInt,
  TrimmedNonEmptyString,
  forwardCompatibleArray,
  forwardCompatibleLiteral,
} from "./common.ts";

/** The usage contract version this library mirrors; the summary reports the server's. */
export const USAGE_CONTRACT_VERSION = 6 as const;

export const UsageProviderKind = forwardCompatibleLiteral([
  "claude",
  "codex",
  "grok",
  "cursor",
  "opencode",
  "antigravity",
  "pi",
]);
export type UsageProviderKind = z.infer<typeof UsageProviderKind>;

/** Calendar day as `YYYY-MM-DD`. */
export const UsageDay = TrimmedNonEmptyString.regex(/^\d{4}-\d{2}-\d{2}$/).brand("UsageDay");
export type UsageDay = z.infer<typeof UsageDay>;
export const usageDay = (value: string): UsageDay => value as UsageDay;

export const UsageResolution = z.enum(["day", "hour"]);
export type UsageResolution = z.infer<typeof UsageResolution>;

export const UsageCostSource = forwardCompatibleLiteral([
  "providerReported",
  "modelPriced",
  "unpriced",
]);
export type UsageCostSource = z.infer<typeof UsageCostSource>;

/**
 * Cached and cache-creation input tokens are disjoint from uncached input
 * tokens. `reasoningTokens` is a subset of `outputTokens`; never add it on top.
 */
export const UsageTokenTotals = z.looseObject({
  uncachedInputTokens: NonNegativeInt,
  cachedInputTokens: NonNegativeInt,
  cacheCreationTokens: NonNegativeInt,
  outputTokens: NonNegativeInt,
  reasoningTokens: NonNegativeInt,
});
export type UsageTokenTotals = z.infer<typeof UsageTokenTotals>;

export const UsageCategoryCost = z.looseObject({
  input: z.number(),
  cacheRead: z.number(),
  cacheWrite: z.number(),
  output: z.number(),
});
export type UsageCategoryCost = z.infer<typeof UsageCategoryCost>;

export const UsageBucket = z.looseObject({
  day: UsageDay,
  hourStart: TrimmedNonEmptyString.optional(),
  provider: UsageProviderKind,
  model: TrimmedNonEmptyString,
  sourcePath: TrimmedNonEmptyString.optional(),
  totals: UsageTokenTotals,
  costUsd: z.number(),
  cacheSavingsUsd: z.number(),
  categoryCostUsd: UsageCategoryCost.optional(),
  fastCostUsd: z.number().optional(),
  ultrafastCostUsd: z.number().optional(),
  speedPremiumUsd: z.number().optional(),
  costSource: UsageCostSource,
  records: NonNegativeInt,
  unpricedRecords: NonNegativeInt,
  /** Sessions in this bucket; a session spans buckets, so total `UsageSource.distinctSessions` instead. */
  sessions: NonNegativeInt,
});
export type UsageBucket = z.infer<typeof UsageBucket>;

export const UsageSourceFingerprint = z.looseObject({
  hostId: TrimmedNonEmptyString,
  provider: UsageProviderKind,
  resolvedHomePath: TrimmedNonEmptyString,
  /** Filesystem identity of the transcript directory, as `device:inode`. */
  volumeId: z.string(),
});
export type UsageSourceFingerprint = z.infer<typeof UsageSourceFingerprint>;

export const UsageSourceStatus = forwardCompatibleLiteral(["ok", "missing", "partial", "failed"]);
export type UsageSourceStatus = z.infer<typeof UsageSourceStatus>;

export const UsageSource = z.looseObject({
  fingerprint: UsageSourceFingerprint,
  status: UsageSourceStatus,
  scannedFiles: NonNegativeInt,
  skippedFiles: NonNegativeInt,
  malformedRecords: NonNegativeInt,
  /** The session count to total across buckets. */
  distinctSessions: NonNegativeInt,
  message: TrimmedNonEmptyString.nullable(),
  action: forwardCompatibleLiteral(["enableCursorKeychain"]).optional(),
  /** The source answered from its cache while a refresh runs; repeat with `awaitRefresh`. */
  refreshing: z.literal(true).optional(),
});
export type UsageSource = z.infer<typeof UsageSource>;

export const UsagePricingStatus = forwardCompatibleLiteral(["fresh", "cached", "unavailable"]);
export type UsagePricingStatus = z.infer<typeof UsagePricingStatus>;

export const UsagePricing = z.looseObject({
  status: UsagePricingStatus,
  source: TrimmedNonEmptyString,
  fetchedAt: z.string().nullable(),
  knownModels: NonNegativeInt,
});
export type UsagePricing = z.infer<typeof UsagePricing>;

export const UsageSummaryInput = z.looseObject({
  sinceDay: UsageDay,
  untilDay: UsageDay,
  /** IANA zone the days are bucketed in, such as `Etc/UTC`. */
  timeZone: TrimmedNonEmptyString,
  resolution: UsageResolution.optional(),
  sinceTime: TrimmedNonEmptyString.optional(),
  untilTime: TrimmedNonEmptyString.optional(),
  /** Wait for slow source refreshes instead of answering from their caches. */
  awaitRefresh: z.boolean().optional(),
});
export type UsageSummaryInput = z.infer<typeof UsageSummaryInput>;

export const UsageSummary = z.looseObject({
  contractVersion: z.number(),
  readAt: z.string(),
  timeZone: TrimmedNonEmptyString,
  sinceDay: UsageDay,
  untilDay: UsageDay,
  buckets: forwardCompatibleArray(UsageBucket),
  sources: forwardCompatibleArray(UsageSource),
  pricing: UsagePricing,
  scanDurationMs: NonNegativeInt,
});
export type UsageSummary = z.infer<typeof UsageSummary>;
