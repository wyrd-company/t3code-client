// ---
// relationships:
//   implements: library
// ---
/**
 * Mirrors the trace, process and OTLP diagnostics in
 * `packages/contracts/src/server.ts`. A result keeps its partial data and reports
 * a read failure in `error`, which is an Effect `Option`.
 */
import { z } from "zod";
import {
  IsoDateTime,
  NonNegativeInt,
  PositiveInt,
  TrimmedNonEmptyString,
  effectOption,
  forwardCompatibleLiteral,
  taggedUnionWithUnknown,
} from "./common.ts";

export const OtlpSignal = z.enum(["traces", "metrics", "logs"]);
export type OtlpSignal = z.infer<typeof OtlpSignal>;

export const OtlpEndpointCheckInput = z.looseObject({
  signal: OtlpSignal,
  url: TrimmedNonEmptyString.regex(/^https?:\/\/./i),
});
export type OtlpEndpointCheckInput = z.infer<typeof OtlpEndpointCheckInput>;

export const OtlpEndpointCheckResult = taggedUnionWithUnknown("_tag", [
  z.looseObject({ _tag: z.literal("Accepted"), latencyMs: z.number() }),
  z.looseObject({ _tag: z.literal("Rejected"), status: z.number() }),
  z.looseObject({ _tag: z.literal("Unreachable"), timedOut: z.boolean() }),
]);
export type OtlpEndpointCheckResult = z.infer<typeof OtlpEndpointCheckResult>;

export const ServerTraceDiagnosticsErrorKind = forwardCompatibleLiteral([
  "trace-file-not-found",
  "trace-file-read-failed",
]);
export type ServerTraceDiagnosticsErrorKind = z.infer<typeof ServerTraceDiagnosticsErrorKind>;

export const ServerTraceDiagnosticsSpanSummary = z.looseObject({
  name: TrimmedNonEmptyString,
  count: NonNegativeInt,
  failureCount: NonNegativeInt,
  totalDurationMs: z.number(),
  averageDurationMs: z.number(),
  maxDurationMs: z.number(),
});
export type ServerTraceDiagnosticsSpanSummary = z.infer<typeof ServerTraceDiagnosticsSpanSummary>;

export const ServerTraceDiagnosticsFailureSummary = z.looseObject({
  name: TrimmedNonEmptyString,
  cause: TrimmedNonEmptyString,
  count: NonNegativeInt,
  lastSeenAt: IsoDateTime,
  traceId: TrimmedNonEmptyString,
  spanId: TrimmedNonEmptyString,
});
export type ServerTraceDiagnosticsFailureSummary = z.infer<
  typeof ServerTraceDiagnosticsFailureSummary
>;

export const ServerTraceDiagnosticsRecentFailure = z.looseObject({
  name: TrimmedNonEmptyString,
  cause: TrimmedNonEmptyString,
  durationMs: z.number(),
  endedAt: IsoDateTime,
  traceId: TrimmedNonEmptyString,
  spanId: TrimmedNonEmptyString,
});
export type ServerTraceDiagnosticsRecentFailure = z.infer<
  typeof ServerTraceDiagnosticsRecentFailure
>;

export const ServerTraceDiagnosticsSpanOccurrence = z.looseObject({
  name: TrimmedNonEmptyString,
  durationMs: z.number(),
  endedAt: IsoDateTime,
  traceId: TrimmedNonEmptyString,
  spanId: TrimmedNonEmptyString,
});
export type ServerTraceDiagnosticsSpanOccurrence = z.infer<
  typeof ServerTraceDiagnosticsSpanOccurrence
>;

export const ServerTraceDiagnosticsLogEvent = z.looseObject({
  spanName: TrimmedNonEmptyString,
  level: TrimmedNonEmptyString,
  message: TrimmedNonEmptyString,
  seenAt: IsoDateTime,
  traceId: TrimmedNonEmptyString,
  spanId: TrimmedNonEmptyString,
});
export type ServerTraceDiagnosticsLogEvent = z.infer<typeof ServerTraceDiagnosticsLogEvent>;

export const ServerTraceDiagnosticsResult = z.looseObject({
  traceFilePath: TrimmedNonEmptyString,
  scannedFilePaths: z.array(TrimmedNonEmptyString),
  readAt: IsoDateTime,
  recordCount: NonNegativeInt,
  parseErrorCount: NonNegativeInt,
  firstSpanAt: effectOption(IsoDateTime),
  lastSpanAt: effectOption(IsoDateTime),
  failureCount: NonNegativeInt,
  interruptionCount: NonNegativeInt,
  slowSpanThresholdMs: NonNegativeInt,
  slowSpanCount: NonNegativeInt,
  logLevelCounts: z.record(TrimmedNonEmptyString, NonNegativeInt),
  topSpansByCount: z.array(ServerTraceDiagnosticsSpanSummary),
  slowestSpans: z.array(ServerTraceDiagnosticsSpanOccurrence),
  commonFailures: z.array(ServerTraceDiagnosticsFailureSummary),
  latestFailures: z.array(ServerTraceDiagnosticsRecentFailure),
  latestWarningAndErrorLogs: z.array(ServerTraceDiagnosticsLogEvent),
  partialFailure: effectOption(z.boolean()),
  error: effectOption(
    z.looseObject({ kind: ServerTraceDiagnosticsErrorKind, message: TrimmedNonEmptyString }),
  ),
});
export type ServerTraceDiagnosticsResult = z.infer<typeof ServerTraceDiagnosticsResult>;

export const ServerProcessDiagnosticsEntry = z.looseObject({
  pid: PositiveInt,
  /** With `pid`, the identity `server.signalProcess` asks for. */
  startTimeMs: NonNegativeInt,
  ppid: NonNegativeInt,
  pgid: effectOption(z.number().int()),
  status: TrimmedNonEmptyString,
  cpuPercent: z.number(),
  rssBytes: NonNegativeInt,
  elapsed: TrimmedNonEmptyString,
  command: TrimmedNonEmptyString,
  depth: NonNegativeInt,
  childPids: z.array(PositiveInt),
});
export type ServerProcessDiagnosticsEntry = z.infer<typeof ServerProcessDiagnosticsEntry>;

export const ServerProcessDiagnosticsResult = z.looseObject({
  serverPid: PositiveInt,
  readAt: IsoDateTime,
  processCount: NonNegativeInt,
  totalRssBytes: NonNegativeInt,
  totalCpuPercent: z.number(),
  processes: z.array(ServerProcessDiagnosticsEntry),
  error: effectOption(z.looseObject({ message: TrimmedNonEmptyString })),
});
export type ServerProcessDiagnosticsResult = z.infer<typeof ServerProcessDiagnosticsResult>;

export const ServerProcessResourceHistoryInput = z.looseObject({
  windowMs: NonNegativeInt,
  bucketMs: NonNegativeInt,
});
export type ServerProcessResourceHistoryInput = z.infer<typeof ServerProcessResourceHistoryInput>;

export const ServerProcessResourceHistoryBucket = z.looseObject({
  startedAt: IsoDateTime,
  endedAt: IsoDateTime,
  avgCpuPercent: z.number(),
  maxCpuPercent: z.number(),
  maxRssBytes: NonNegativeInt,
  maxProcessCount: NonNegativeInt,
});
export type ServerProcessResourceHistoryBucket = z.infer<typeof ServerProcessResourceHistoryBucket>;

export const ServerProcessResourceHistorySummary = z.looseObject({
  processKey: TrimmedNonEmptyString,
  pid: PositiveInt,
  ppid: NonNegativeInt,
  command: TrimmedNonEmptyString,
  depth: NonNegativeInt,
  isServerRoot: z.boolean(),
  firstSeenAt: IsoDateTime,
  lastSeenAt: IsoDateTime,
  currentCpuPercent: z.number(),
  avgCpuPercent: z.number(),
  maxCpuPercent: z.number(),
  cpuSecondsApprox: z.number(),
  currentRssBytes: NonNegativeInt,
  maxRssBytes: NonNegativeInt,
  sampleCount: NonNegativeInt,
});
export type ServerProcessResourceHistorySummary = z.infer<
  typeof ServerProcessResourceHistorySummary
>;

export const ServerProcessResourceHistoryFailureTag = forwardCompatibleLiteral([
  "ProcessDiagnosticsQueryTimeoutError",
  "ProcessDiagnosticsQueryFailedError",
  "ProcessDiagnosticsServerProcessSignalError",
  "ProcessDiagnosticsNotDescendantError",
  "ProcessDiagnosticsSignalFailedError",
]);
export type ServerProcessResourceHistoryFailureTag = z.infer<
  typeof ServerProcessResourceHistoryFailureTag
>;

export const ServerProcessResourceHistoryResult = z.looseObject({
  readAt: IsoDateTime,
  windowMs: NonNegativeInt,
  bucketMs: NonNegativeInt,
  sampleIntervalMs: NonNegativeInt,
  retainedSampleCount: NonNegativeInt,
  totalCpuSecondsApprox: z.number(),
  buckets: z.array(ServerProcessResourceHistoryBucket),
  topProcesses: z.array(ServerProcessResourceHistorySummary),
  error: effectOption(
    z.looseObject({
      failureTag: ServerProcessResourceHistoryFailureTag,
      message: TrimmedNonEmptyString,
    }),
  ),
});
export type ServerProcessResourceHistoryResult = z.infer<typeof ServerProcessResourceHistoryResult>;

/** The two signals the server sends. */
export const ServerProcessSignal = z.enum(["SIGINT", "SIGKILL"]);
export type ServerProcessSignal = z.infer<typeof ServerProcessSignal>;

export const ServerSignalProcessInput = z.looseObject({
  pid: PositiveInt,
  startTimeMs: NonNegativeInt,
  signal: ServerProcessSignal,
});
export type ServerSignalProcessInput = z.infer<typeof ServerSignalProcessInput>;

export const ServerSignalProcessResult = z.looseObject({
  pid: PositiveInt,
  signal: forwardCompatibleLiteral(["SIGINT", "SIGKILL"]),
  /** False when the server refused: `message` says why. */
  signaled: z.boolean(),
  message: effectOption(TrimmedNonEmptyString),
});
export type ServerSignalProcessResult = z.infer<typeof ServerSignalProcessResult>;
