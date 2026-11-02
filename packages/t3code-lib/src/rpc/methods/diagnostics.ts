// ---
// relationships:
//   implements: library
// ---
import { z } from "zod";
import { defineMethod } from "../spec.ts";
import {
  OtlpEndpointCheckInput,
  OtlpEndpointCheckResult,
  ServerProcessDiagnosticsResult,
  ServerProcessResourceHistoryInput,
  ServerProcessResourceHistoryResult,
  ServerSignalProcessInput,
  ServerSignalProcessResult,
  ServerTraceDiagnosticsResult,
} from "../../schemas/diagnostics.ts";
import {
  HostResourcesSnapshot,
  ResourceTelemetryHistory,
  ResourceTelemetryHistoryInput,
  ResourceTelemetryRetryResult,
  ResourceTelemetrySnapshot,
} from "../../schemas/resourceTelemetry.ts";
import { StorageCleanupReport, StorageCleanupReportUpdate } from "../../schemas/storageCleanup.ts";

export const diagnosticsMethods = {
  "server.getTraceDiagnostics": defineMethod({
    payload: z.looseObject({}),
    success: ServerTraceDiagnosticsResult,
    stream: false,
    scope: "diagnostics:read",
  }),
  "server.getProcessDiagnostics": defineMethod({
    payload: z.looseObject({}),
    success: ServerProcessDiagnosticsResult,
    stream: false,
    scope: "diagnostics:read",
  }),
  "server.getHostResources": defineMethod({
    payload: z.looseObject({}),
    success: HostResourcesSnapshot,
    stream: false,
    scope: "orchestration:read",
  }),
  "server.getProcessResourceHistory": defineMethod({
    payload: ServerProcessResourceHistoryInput,
    success: ServerProcessResourceHistoryResult,
    stream: false,
    scope: "diagnostics:read",
  }),
  "server.getResourceTelemetryHistory": defineMethod({
    payload: ResourceTelemetryHistoryInput,
    success: ResourceTelemetryHistory,
    stream: false,
    scope: "diagnostics:read",
  }),
  /** Restarts the server's resource monitor, so it needs both scopes. */
  "server.retryResourceTelemetry": defineMethod({
    payload: z.looseObject({}),
    success: ResourceTelemetryRetryResult,
    stream: false,
    scope: "diagnostics:read",
    payloadScopes: () => ["environment:maintain"],
  }),
  /** The server sends an empty export to the URL and reports the answer. */
  "server.checkOtlpEndpoint": defineMethod({
    payload: OtlpEndpointCheckInput,
    success: OtlpEndpointCheckResult,
    stream: false,
    scope: "settings:write",
  }),
  /** Only for a descendant of the server. A refusal is a result with `signaled: false`. */
  "server.signalProcess": defineMethod({
    payload: ServerSignalProcessInput,
    success: ServerSignalProcessResult,
    stream: false,
    scope: "environment:maintain",
  }),
  /** Removes what the storage cleanup settings allow, on the server host. */
  "server.runStorageCleanup": defineMethod({
    payload: z.looseObject({}),
    success: StorageCleanupReport,
    stream: false,
    scope: "settings:write",
  }),
  "server.getStorageCleanupReport": defineMethod({
    payload: z.looseObject({}),
    success: StorageCleanupReportUpdate,
    stream: true,
    scope: "orchestration:read",
  }),
  subscribeResourceTelemetry: defineMethod({
    payload: z.looseObject({}),
    success: ResourceTelemetrySnapshot,
    stream: true,
    scope: "diagnostics:read",
  }),
} as const;
