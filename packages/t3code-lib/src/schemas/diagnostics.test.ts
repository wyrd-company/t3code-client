// ---
// relationships:
//   verifies: library-wire
// ---
import { describe, expect, it } from "vite-plus/test";
import { rpcMethods } from "../rpc/registry.ts";
import {
  OtlpEndpointCheckInput,
  OtlpEndpointCheckResult,
  ServerProcessDiagnosticsResult,
  ServerSignalProcessInput,
  ServerSignalProcessResult,
} from "./diagnostics.ts";
import { HostResourcesSnapshot, ResourceTelemetrySourceHealth } from "./resourceTelemetry.ts";
import { StorageCleanupReport, StorageCleanupReportUpdate } from "./storageCleanup.ts";

describe("diagnostics inputs", () => {
  it("takes only the signals the server sends", () => {
    const input = { pid: 42, startTimeMs: 1, signal: "SIGINT" };
    expect(ServerSignalProcessInput.parse(input)).toEqual(input);
    expect(ServerSignalProcessInput.safeParse({ ...input, signal: "SIGTERM" }).success).toBe(false);
    expect(ServerSignalProcessInput.safeParse({ ...input, pid: 0 }).success).toBe(false);
  });

  it("takes only an HTTP endpoint for a known signal", () => {
    expect(
      OtlpEndpointCheckInput.parse({ signal: "logs", url: " https://example.invalid/v1/logs " })
        .url,
    ).toBe("https://example.invalid/v1/logs");
    for (const input of [
      { signal: "logs", url: "ftp://example.invalid" },
      { signal: "logs", url: "http://" },
      { signal: "profiles", url: "https://example.invalid" },
    ]) {
      expect(OtlpEndpointCheckInput.safeParse(input).success).toBe(false);
    }
  });
});

describe("diagnostics results", () => {
  it("decodes each outcome of an endpoint check", () => {
    for (const outcome of [
      { _tag: "Accepted", latencyMs: 3 },
      { _tag: "Rejected", status: 500 },
      { _tag: "Unreachable", timedOut: true },
    ]) {
      expect(OtlpEndpointCheckResult.parse(outcome)).toEqual(outcome);
    }
    expect(OtlpEndpointCheckResult.safeParse({ _tag: "Rejected" }).success).toBe(false);
  });

  it("decodes an Option field from both of its records", () => {
    const result = { pid: 42, signal: "SIGKILL", signaled: false };
    for (const message of [{ _tag: "None" }, { _tag: "Some", value: "Refused." }]) {
      expect(ServerSignalProcessResult.parse({ ...result, message }).message).toEqual(message);
    }
    expect(ServerSignalProcessResult.safeParse({ ...result, message: null }).success).toBe(false);
    expect(
      ServerSignalProcessResult.safeParse({ ...result, message: { _tag: "Some", value: "" } })
        .success,
    ).toBe(false);
  });

  it("keeps a process list with a read failure", () => {
    const parsed = ServerProcessDiagnosticsResult.parse({
      serverPid: 1,
      readAt: "2026-01-01T00:00:00.000Z",
      processCount: 0,
      totalRssBytes: 0,
      totalCpuPercent: 0,
      processes: [],
      error: { _tag: "Some", value: { message: "Sample failure." } },
    });
    expect(parsed.error).toEqual({ _tag: "Some", value: { message: "Sample failure." } });
  });

  it("decodes a host with no CPU value and refuses a value out of range", () => {
    const host = { sampledAt: 1, cpuCount: 2, availableMemoryBytes: 3, totalMemoryBytes: 4 };
    expect(HostResourcesSnapshot.parse({ ...host, cpuUtilization: null }).cpuUtilization).toBe(
      null,
    );
    expect(HostResourcesSnapshot.safeParse({ ...host, cpuUtilization: 1.5 }).success).toBe(false);
  });

  it("keeps a source status from a newer server", () => {
    const health = {
      status: "sample-status",
      lastSampleAt: { _tag: "None" },
      lastError: { _tag: "None" },
    };
    expect(ResourceTelemetrySourceHealth.parse(health).status).toBe("sample-status");
  });

  it("gives a report's optional numbers the server's defaults", () => {
    const entry = {
      kind: "logs",
      outcome: "kept",
      reason: "Sample reason",
      path: null,
      threadId: null,
      threadTitle: null,
    };
    const report = StorageCleanupReport.parse({
      trigger: "manual",
      startedAt: "2026-01-01T00:00:00.000Z",
      finishedAt: "2026-01-01T00:00:01.000Z",
      entries: [entry],
      counts: { removed: 0, kept: 1, failed: 0 },
      omittedCount: 0,
    });
    expect(report.bytesFreed).toBe(0);
    expect(report.entries[0]).toMatchObject({ projectPath: null, bytes: null, files: null });
    expect(StorageCleanupReportUpdate.parse(null)).toBe(null);
  });
});

describe("diagnostics scopes", () => {
  it("asks for both scopes on a telemetry retry", () => {
    const spec = rpcMethods["server.retryResourceTelemetry"];
    expect(spec.scope).toBe("diagnostics:read");
    expect(spec.payloadScopes?.({})).toEqual(["environment:maintain"]);
  });
});
