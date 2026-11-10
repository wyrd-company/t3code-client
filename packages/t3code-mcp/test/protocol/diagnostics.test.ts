// ---
// relationships:
//   verifies: mcp
// ---
import { afterEach, expect, it, vi } from "vite-plus/test";
import { maxTextChars } from "../../src/tools/results.ts";
import { closeProtocolFixtures, protocolFixture as fixture } from "../support/protocolFixture.ts";

afterEach(closeProtocolFixtures);

const none = { _tag: "None" } as const;
const some = <T>(value: T) => ({ _tag: "Some", value }) as const;
const at = "2026-01-01T00:00:00.000Z";
const long = `${"x".repeat(maxTextChars)}tail`;

const process = (pid: number, command: string) => ({
  pid,
  startTimeMs: 1,
  ppid: 1,
  pgid: some(pid),
  status: "S",
  cpuPercent: 0.5,
  rssBytes: 1024,
  elapsed: "00:01",
  command,
  depth: 1,
  childPids: [],
});

it("bounds the process list and command lines and unwraps options", async () => {
  const { client, upstream } = await fixture();
  vi.spyOn(upstream.diagnostics, "processes").mockResolvedValue({
    serverPid: 1,
    readAt: at,
    processCount: 3,
    totalRssBytes: 3072,
    totalCpuPercent: 1.5,
    processes: [process(2, long), process(3, "sample"), process(4, "sample")],
    error: none,
  });
  const result = await client.callTool({
    name: "server_processes",
    arguments: { maxProcesses: 2 },
  });
  const content = result.structuredContent as {
    processes: { pid: number; command: string; pgid: number | null }[];
    omittedProcesses: number;
    error: unknown;
  };
  expect(content.processes.map((row) => row.pid)).toEqual([2, 3]);
  expect(content.processes[0]?.command).toHaveLength(maxTextChars);
  expect(content.processes[0]?.command.endsWith("…")).toBe(true);
  expect(content.processes[0]?.pgid).toBe(2);
  expect(content.omittedProcesses).toBe(1);
  expect(content.error).toBeNull();
});

it("clips the process read error message", async () => {
  const { client, upstream } = await fixture();
  vi.spyOn(upstream.diagnostics, "processes").mockResolvedValue({
    serverPid: 1,
    readAt: at,
    processCount: 0,
    totalRssBytes: 0,
    totalCpuPercent: 0,
    processes: [],
    error: some({ message: long }),
  });
  const result = await client.callTool({ name: "server_processes", arguments: {} });
  expect(result.structuredContent).toMatchObject({
    error: { message: `${"x".repeat(maxTextChars - 1)}…` },
  });
});

it("clips trace causes and log messages", async () => {
  const { client, upstream } = await fixture();
  const ids = { traceId: "trace-1", spanId: "span-1" };
  vi.spyOn(upstream.diagnostics, "traces").mockResolvedValue({
    traceFilePath: "/sample/trace.ndjson",
    scannedFilePaths: ["/sample/trace.ndjson"],
    readAt: at,
    recordCount: 2,
    parseErrorCount: 0,
    firstSpanAt: some(at),
    lastSpanAt: some(at),
    failureCount: 1,
    interruptionCount: 0,
    slowSpanThresholdMs: 1000,
    slowSpanCount: 0,
    logLevelCounts: { Warning: 1 },
    topSpansByCount: [],
    slowestSpans: [],
    commonFailures: [{ name: "sample", cause: long, count: 1, lastSeenAt: at, ...ids }],
    latestFailures: [{ name: "sample", cause: "short", durationMs: 1, endedAt: at, ...ids }],
    latestWarningAndErrorLogs: [
      { spanName: "sample", level: "Warning", message: long, seenAt: at, ...ids },
    ],
    partialFailure: none,
    error: some({ kind: "trace-file-read-failed", message: long }),
  });
  const result = await client.callTool({ name: "server_traces", arguments: {} });
  expect(result.structuredContent).toMatchObject({
    firstSpanAt: at,
    partialFailure: null,
    error: { kind: "trace-file-read-failed", message: `${"x".repeat(maxTextChars - 1)}…` },
    commonFailures: [{ cause: `${"x".repeat(maxTextChars - 1)}…` }],
    latestFailures: [{ cause: "short" }],
    latestWarningAndErrorLogs: [{ message: `${"x".repeat(maxTextChars - 1)}…` }],
  });
});

it("asks for a 30th of the default window and refuses too many buckets", async () => {
  const { client, upstream } = await fixture();
  const spy = vi
    .spyOn(upstream.diagnostics, "resourceHistory")
    .mockRejectedValue(new Error("sample"));
  await client.callTool({ name: "server_resource_history", arguments: {} });
  expect(spy).toHaveBeenCalledWith(
    { windowMs: 900_000, bucketMs: 30_000 },
    expect.any(AbortSignal),
  );

  spy.mockClear();
  const refused = await client.callTool({
    name: "server_resource_history",
    arguments: { windowMs: 3_600_000, bucketMs: 1_000 },
  });
  expect(refused.isError).toBe(true);
  expect(spy).not.toHaveBeenCalled();
});

it("returns report null before the first cleanup", async () => {
  const { client, upstream } = await fixture();
  vi.spyOn(upstream.diagnostics, "storageCleanupReport").mockResolvedValue(null);
  const result = await client.callTool({ name: "server_storage_cleanup_report", arguments: {} });
  expect(result.structuredContent).toEqual({ report: null });
});

it("marks every diagnostics tool read-only", async () => {
  const { client } = await fixture();
  const { tools } = await client.listTools();
  const names = new Set([
    "server_traces",
    "server_processes",
    "server_host_resources",
    "server_resource_history",
    "server_storage_cleanup_report",
  ]);
  const diagnostics = tools.filter((row) => names.has(row.name));
  expect(diagnostics).toHaveLength(names.size);
  for (const tool of diagnostics)
    expect(tool.annotations).toMatchObject({ readOnlyHint: true, destructiveHint: false });
});
