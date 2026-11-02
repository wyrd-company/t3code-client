// ---
// relationships:
//   verifies: library
// ---
import { describe, expect, it } from "vite-plus/test";
import { ExecutionEnvironmentCapabilities, ExecutionEnvironmentDescriptor } from "./environment.ts";
import { ComposerContextRecord } from "./orchestration/messageContext.ts";
import { ThreadPullRequestWatch } from "./orchestration/pullRequest.ts";
import { ServerObservability } from "./server.ts";
import { TerminalEvent } from "./terminal.ts";
import { UsageProviderKind } from "./usage.ts";

const at = "2026-01-01T00:00:00.000Z";
const watch = {
  startedAt: at,
  headSha: null,
  failedChecks: [],
  passed: false,
  remarksThrough: at,
  remarkIds: [],
  conflicting: false,
  wakes: 0,
};
const observability = { logsDirectoryPath: "/sample/logs" };

describe("field changes of 0.1.6 outside orchestration", () => {
  it("reads the new capability flags and refuses a non-boolean", () => {
    const flags = {
      sideChats: true,
      threadForceStop: true,
      localServerStop: false,
      desktopAppChannelSwitch: true,
    };
    expect(ExecutionEnvironmentCapabilities.parse(flags)).toMatchObject(flags);
    expect(ExecutionEnvironmentCapabilities.safeParse({ sideChats: "yes" }).success).toBe(false);
  });

  it("keeps databaseMigration optional on the descriptor", () => {
    const descriptor = {
      environmentId: "environment-1",
      label: "Sample environment",
      platform: { os: "linux", arch: "arm64", machine: "server" },
      serverVersion: "1.2.3",
      capabilities: {},
    };
    expect(ExecutionEnvironmentDescriptor.parse(descriptor).databaseMigration).toBeUndefined();
    expect(
      ExecutionEnvironmentDescriptor.parse({ ...descriptor, databaseMigration: 7 })
        .databaseMigration,
    ).toBe(7);
  });

  it("reads an endpoint source, an unknown source, and a null or named variable", () => {
    expect(
      ServerObservability.parse({
        ...observability,
        otlpTracesSource: "settings",
        otlpTracesVariable: null,
        otlpMetricsSource: "environment",
        otlpMetricsVariable: "SAMPLE_VARIABLE",
        otlpLogsSource: "future",
      }),
    ).toMatchObject({
      otlpTracesVariable: null,
      otlpMetricsVariable: "SAMPLE_VARIABLE",
      otlpLogsSource: "future",
    });
  });

  it("reads the grid on a terminal activity event", () => {
    const event = {
      type: "activity",
      threadId: "thread-1",
      terminalId: "terminal-1",
      hasRunningSubprocess: false,
      label: "sample",
    };
    expect(TerminalEvent.parse({ ...event, cols: 90, rows: 30 })).toMatchObject({
      cols: 90,
      rows: 30,
    });
    expect(TerminalEvent.parse(event)).not.toHaveProperty("cols");
    expect(TerminalEvent.safeParse({ ...event, cols: 0 }).success).toBe(false);
  });

  it("reads owed checks and an awaited check time on a watch", () => {
    expect(ThreadPullRequestWatch.parse(watch)).not.toHaveProperty("owedChecks");
    expect(
      ThreadPullRequestWatch.parse({
        ...watch,
        owedChecks: ["sample-check"],
        checksAwaitedSince: at,
      }),
    ).toMatchObject({ owedChecks: ["sample-check"], checksAwaitedSince: at });
    expect(ThreadPullRequestWatch.parse({ ...watch, checksAwaitedSince: null })).toMatchObject({
      checksAwaitedSince: null,
    });
  });

  it("reads the muse usage provider", () => {
    expect(UsageProviderKind.parse("muse")).toBe("muse");
  });

  it("types an environment context record and refuses a malformed one", () => {
    const record = {
      version: 1,
      contextId: "context-1",
      label: "Sample environment",
      kind: "environment",
    };
    expect(
      ComposerContextRecord.parse({ ...record, environmentId: "environment-1" }),
    ).toMatchObject({ kind: "environment", environmentId: "environment-1" });
    expect(ComposerContextRecord.safeParse(record).success).toBe(false);
  });
});
