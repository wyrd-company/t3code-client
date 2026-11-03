// ---
// relationships:
//   implements: library
// ---
/**
 * Mirrors the client side of `packages/contracts/src/resourceTelemetry.ts`: what
 * the server reports about its host and its process tree. The commands and events
 * between the server and its resource monitor are not client surface.
 */
import { z } from "zod";
import {
  IsoDateTime,
  NonNegativeInt,
  PositiveInt,
  TrimmedNonEmptyString,
  effectOption,
  forwardCompatibleLiteral,
} from "./common.ts";

export const HostResourcesSnapshot = z.looseObject({
  /** Milliseconds since the Unix epoch. */
  sampledAt: NonNegativeInt,
  /** From 0 to 1, or `null` when the CPU counters give no value. */
  cpuUtilization: z.number().min(0).max(1).nullable(),
  cpuCount: NonNegativeInt,
  availableMemoryBytes: NonNegativeInt,
  totalMemoryBytes: NonNegativeInt,
});
export type HostResourcesSnapshot = z.infer<typeof HostResourcesSnapshot>;

export const HostPowerSnapshot = z.looseObject({
  source: forwardCompatibleLiteral([
    "unknown",
    "node-macos-shell",
    "node-macos-native",
    "node-linux",
    "node-windows",
    "electron-main",
  ]),
  idle: forwardCompatibleLiteral(["unknown", "true", "false"]),
  idleSeconds: z.number().nullable(),
  locked: forwardCompatibleLiteral(["unknown", "true", "false"]),
  suspended: z.boolean(),
  onBattery: forwardCompatibleLiteral(["unknown", "true", "false"]),
  lowPowerMode: forwardCompatibleLiteral(["unknown", "true", "false"]),
  thermalState: forwardCompatibleLiteral(["unknown", "nominal", "fair", "serious", "critical"]),
  stale: z.boolean(),
  updatedAt: IsoDateTime,
});
export type HostPowerSnapshot = z.infer<typeof HostPowerSnapshot>;

export const ResourceTelemetryIoSemantics = forwardCompatibleLiteral([
  "storage",
  "logical",
  "all-io",
  "unavailable",
]);
export type ResourceTelemetryIoSemantics = z.infer<typeof ResourceTelemetryIoSemantics>;

export const ResourceTelemetryProcessCategory = forwardCompatibleLiteral([
  "server",
  "server-child",
  "provider-root",
  "terminal-root",
  "electron-main",
  "electron-renderer",
  "electron-gpu",
  "electron-utility",
  "resource-monitor",
  "unknown-t3",
]);
export type ResourceTelemetryProcessCategory = z.infer<typeof ResourceTelemetryProcessCategory>;

export const ResourceTelemetrySourceStatus = forwardCompatibleLiteral([
  "starting",
  "healthy",
  "degraded",
  "unavailable",
  "stopped",
]);
export type ResourceTelemetrySourceStatus = z.infer<typeof ResourceTelemetrySourceStatus>;

/** A pid can be reused, so a process is its pid and its start time. */
export const ResourceTelemetryProcessIdentity = z.looseObject({
  pid: PositiveInt,
  startTimeMs: NonNegativeInt,
});
export type ResourceTelemetryProcessIdentity = z.infer<typeof ResourceTelemetryProcessIdentity>;

export const DesktopElectronProcessType = forwardCompatibleLiteral([
  "Browser",
  "Tab",
  "Utility",
  "Zygote",
  "Sandbox helper",
  "GPU",
  "Pepper Plugin",
  "Pepper Plugin Broker",
  "Unknown",
]);
export type DesktopElectronProcessType = z.infer<typeof DesktopElectronProcessType>;

export const ResourceTelemetryProcess = z.looseObject({
  identity: ResourceTelemetryProcessIdentity,
  ppid: NonNegativeInt,
  childPids: z.array(PositiveInt),
  depth: NonNegativeInt,
  name: z.string(),
  command: z.string(),
  status: z.string(),
  category: ResourceTelemetryProcessCategory,
  electronType: DesktopElectronProcessType.optional(),
  electronServiceName: z.string().optional(),
  cpuPercent: z.number(),
  cpuTimeMs: NonNegativeInt,
  residentBytes: NonNegativeInt,
  peakResidentBytes: NonNegativeInt,
  virtualBytes: NonNegativeInt,
  ioReadBytes: NonNegativeInt,
  ioWriteBytes: NonNegativeInt,
  ioReadBytesPerSecond: z.number(),
  ioWriteBytesPerSecond: z.number(),
  ioSemantics: ResourceTelemetryIoSemantics,
  idleWakeupsPerSecond: z.number().optional(),
  runTimeMs: NonNegativeInt,
  firstSeenAt: IsoDateTime,
  lastSeenAt: IsoDateTime,
});
export type ResourceTelemetryProcess = z.infer<typeof ResourceTelemetryProcess>;

export const ResourceTelemetryAggregate = z.looseObject({
  processCount: NonNegativeInt,
  currentCpuPercent: z.number(),
  cpuTimeMs: NonNegativeInt,
  currentRssBytes: NonNegativeInt,
  peakRssBytes: NonNegativeInt,
  ioReadBytes: NonNegativeInt,
  ioWriteBytes: NonNegativeInt,
  ioReadBytesPerSecond: z.number(),
  ioWriteBytesPerSecond: z.number(),
  processStarts: NonNegativeInt,
  processExits: NonNegativeInt,
});
export type ResourceTelemetryAggregate = z.infer<typeof ResourceTelemetryAggregate>;

export const ResourceTelemetryGroups = z.looseObject({
  backend: ResourceTelemetryAggregate,
  electron: ResourceTelemetryAggregate,
  monitor: ResourceTelemetryAggregate,
  allT3: ResourceTelemetryAggregate,
});
export type ResourceTelemetryGroups = z.infer<typeof ResourceTelemetryGroups>;

export const ResourceTelemetrySourceHealth = z.looseObject({
  status: ResourceTelemetrySourceStatus,
  lastSampleAt: effectOption(IsoDateTime),
  lastError: effectOption(TrimmedNonEmptyString),
});
export type ResourceTelemetrySourceHealth = z.infer<typeof ResourceTelemetrySourceHealth>;

export const ResourceTelemetryHealth = z.looseObject({
  native: ResourceTelemetrySourceHealth,
  desktop: ResourceTelemetrySourceHealth,
  sidecarVersion: effectOption(TrimmedNonEmptyString),
  sidecarPid: effectOption(PositiveInt),
  restartCount: NonNegativeInt,
  collectionDurationMicros: NonNegativeInt,
  scannedProcessCount: NonNegativeInt,
  retainedProcessCount: NonNegativeInt,
  inaccessibleProcessCount: NonNegativeInt,
});
export type ResourceTelemetryHealth = z.infer<typeof ResourceTelemetryHealth>;

export const ResourceAttributionEntry = z.looseObject({
  component: TrimmedNonEmptyString,
  operation: TrimmedNonEmptyString,
  logicalReadBytes: NonNegativeInt,
  logicalWriteBytes: NonNegativeInt,
  count: NonNegativeInt,
  durationMs: NonNegativeInt,
});
export type ResourceAttributionEntry = z.infer<typeof ResourceAttributionEntry>;

export const ResourceAttributionSnapshot = z.looseObject({
  readAt: IsoDateTime,
  entries: z.array(ResourceAttributionEntry),
});
export type ResourceAttributionSnapshot = z.infer<typeof ResourceAttributionSnapshot>;

export const ResourceTelemetrySnapshot = z.looseObject({
  readAt: IsoDateTime,
  sampleIntervalMs: NonNegativeInt,
  processes: z.array(ResourceTelemetryProcess),
  groups: ResourceTelemetryGroups,
  power: HostPowerSnapshot,
  speedLimitPercent: effectOption(z.number()),
  attribution: ResourceAttributionSnapshot,
  health: ResourceTelemetryHealth,
});
export type ResourceTelemetrySnapshot = z.infer<typeof ResourceTelemetrySnapshot>;

export const ResourceTelemetryHistoryInput = z.looseObject({
  windowMs: NonNegativeInt,
  bucketMs: NonNegativeInt,
});
export type ResourceTelemetryHistoryInput = z.infer<typeof ResourceTelemetryHistoryInput>;

export const ResourceTelemetryHistoryBucket = z.looseObject({
  startedAt: IsoDateTime,
  endedAt: IsoDateTime,
  avgCpuPercent: z.number(),
  maxCpuPercent: z.number(),
  maxRssBytes: NonNegativeInt,
  ioReadBytes: NonNegativeInt,
  ioWriteBytes: NonNegativeInt,
  maxProcessCount: NonNegativeInt,
});
export type ResourceTelemetryHistoryBucket = z.infer<typeof ResourceTelemetryHistoryBucket>;

export const ResourceTelemetryProcessSummary = z.looseObject({
  identity: ResourceTelemetryProcessIdentity,
  ppid: NonNegativeInt,
  depth: NonNegativeInt,
  name: z.string(),
  command: z.string(),
  category: ResourceTelemetryProcessCategory,
  firstSeenAt: IsoDateTime,
  lastSeenAt: IsoDateTime,
  currentCpuPercent: z.number(),
  avgCpuPercent: z.number(),
  maxCpuPercent: z.number(),
  cpuTimeMs: NonNegativeInt,
  currentRssBytes: NonNegativeInt,
  peakRssBytes: NonNegativeInt,
  ioReadBytes: NonNegativeInt,
  ioWriteBytes: NonNegativeInt,
  ioSemantics: ResourceTelemetryIoSemantics,
  sampleCount: NonNegativeInt,
});
export type ResourceTelemetryProcessSummary = z.infer<typeof ResourceTelemetryProcessSummary>;

export const ResourceTelemetryHistory = z.looseObject({
  readAt: IsoDateTime,
  windowMs: NonNegativeInt,
  bucketMs: NonNegativeInt,
  sampleIntervalMs: NonNegativeInt,
  retainedSampleCount: NonNegativeInt,
  buckets: z.array(ResourceTelemetryHistoryBucket),
  topProcesses: z.array(ResourceTelemetryProcessSummary),
  health: ResourceTelemetryHealth,
});
export type ResourceTelemetryHistory = z.infer<typeof ResourceTelemetryHistory>;

export const ResourceTelemetryRetryResult = z.looseObject({
  /** False when the monitor is in no state to restart. */
  accepted: z.boolean(),
  snapshot: ResourceTelemetrySnapshot,
});
export type ResourceTelemetryRetryResult = z.infer<typeof ResourceTelemetryRetryResult>;
