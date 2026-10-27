// ---
// relationships:
//   verifies: command-line
// ---
import { afterEach, expect, it, vi } from "vite-plus/test";
import { schemas, T3AuthError, T3Client, T3ConnectionError } from "@wyrd-company/t3code-lib";
import { runWith, sampleProvider } from "../../test/support/automationHarness.ts";
import { providerUsageHandlers } from "./providerUsage.ts";

const client = T3Client.create({ baseUrl: "http://127.0.0.1:1" });
const run = (args: string[], json = true) => runWith(client, providerUsageHandlers, args, json);
const window = ["--since-day", "2026-01-01", "--until-day", "2026-01-02", "--time-zone", "Etc/UTC"];
const summary = schemas.usage.UsageSummary.parse({
  contractVersion: 6,
  readAt: "2026-01-03T00:00:00Z",
  timeZone: "Etc/UTC",
  sinceDay: "2026-01-01",
  untilDay: "2026-01-02",
  buckets: [
    {
      day: "2026-01-02",
      provider: "sample-provider-kind",
      model: "sample-model",
      totals: {
        uncachedInputTokens: 10,
        cachedInputTokens: 5,
        cacheCreationTokens: 0,
        outputTokens: 7,
        reasoningTokens: 3,
      },
      costUsd: 0.25,
      cacheSavingsUsd: 0.01,
      costSource: "sample-new-source",
      records: 2,
      unpricedRecords: 0,
      sessions: 1,
    },
  ],
  sources: [
    {
      fingerprint: {
        hostId: "host-sample",
        provider: "codex",
        resolvedHomePath: "/sample",
        volumeId: "1:2",
      },
      status: "partial",
      scannedFiles: 3,
      skippedFiles: 1,
      malformedRecords: 0,
      distinctSessions: 1,
      message: null,
      refreshing: true,
    },
  ],
  pricing: { status: "cached", source: "sample", fetchedAt: null, knownModels: 4 },
  scanDurationMs: 12,
});
afterEach(() => vi.restoreAllMocks());

it("passes an exact provider instance and keeps auth, availability and limits", async () => {
  const provider = schemas.provider.ServerProvider.parse(sampleProvider);
  const read = vi.spyOn(client.server, "providerStatus").mockResolvedValue([provider]);
  const result = await run(["provider", "status", "sample-provider"]);
  expect(read).toHaveBeenCalledWith("sample-provider");
  expect(result.result).toEqual({ data: [provider], exitCode: 0 });
  const text = await run(["provider", "status"], false);
  expect(read).toHaveBeenLastCalledWith(undefined);
  expect(text.stdout).toContain(
    "sample-provider\tcodex\tenabled\tinstalled\tready\tavailable\tauth authenticated",
  );
  expect(text.stdout).toContain("usage\tSession\t40%");
  read.mockResolvedValue([]);
  expect((await run(["provider", "status", "absent"])).code).toBe(10);
  expect((await run(["provider", "status"])).result.data).toEqual([]);
  expect(await run(["provider", "status", " "])).toMatchObject({ code: 2, connected: false });
});

it("forwards explicit usage bounds and every RPC option without totaling", async () => {
  const read = vi.spyOn(client.server, "usageSummary").mockResolvedValue(summary);
  expect((await run(["usage", "summary", ...window])).result).toEqual({
    data: summary,
    exitCode: 0,
  });
  expect(read).toHaveBeenLastCalledWith({
    sinceDay: "2026-01-01",
    untilDay: "2026-01-02",
    timeZone: "Etc/UTC",
  });
  const times = [
    "--resolution",
    "hour",
    "--since-time",
    "2026-01-01T08:00:00Z",
    "--until-time",
    "2026-01-01T17:00:00Z",
    "--await-refresh",
  ];
  const text = await run(["usage", "summary", ...window, ...times], false);
  expect(read).toHaveBeenLastCalledWith({
    sinceDay: "2026-01-01",
    untilDay: "2026-01-02",
    timeZone: "Etc/UTC",
    resolution: "hour",
    sinceTime: "2026-01-01T08:00:00Z",
    untilTime: "2026-01-01T17:00:00Z",
    awaitRefresh: true,
  });
  expect(text.stdout).toContain(
    "input 10\tcached 5\tcacheWrite 0\toutput 7\treasoning 3\t0.25 USD\tsample-new-source",
  );
  expect(text.stdout).toContain("source\tcodex\tpartial\t3 files\t1 sessions\trefreshing");
  expect(text.stdout).not.toContain("total");
});

it("rejects missing, invalid or reversed usage bounds before connecting", async () => {
  const cases = [
    [],
    ["--since-day", "2026-01-01"],
    [...window, "--since-day", "2026-02-30"],
    [...window, "--since-day", "2026-99-01"],
    [...window, "--until-day", "2025-12-31"],
    [...window, "--time-zone", "Sample/Unknown"],
    [...window, "--time-zone", "+01:00"],
    [...window, "--since-time", " "],
    [...window, "--resolution", "week"],
    [...window, "--resolution", "hour"],
    [...window, "--resolution", "hour", "--since-time", "08:00", "--until-time", "17:00"],
    [
      ...window,
      "--resolution",
      "hour",
      "--since-time",
      "2026-01-01T00:00:00Z",
      "--until-time",
      "2026-01-03T00:00:00Z",
    ],
  ];
  for (const args of cases)
    expect(await run(["usage", "summary", ...args]), args.join(" ")).toMatchObject({
      code: 2,
      connected: false,
    });
});

it("maps authorization and connection failures through the normal envelope", async () => {
  vi.spyOn(client.server, "usageSummary").mockRejectedValue(
    T3AuthError.insufficientScope("diagnostics:read", "sample"),
  );
  expect(await run(["usage", "summary", ...window])).toMatchObject({
    code: 9,
    result: { data: null, exitCode: 9, error: { requiredScope: "diagnostics:read" } },
  });
  vi.spyOn(client.server, "providerStatus").mockRejectedValue(
    new T3ConnectionError("open_failed", "sample"),
  );
  expect(await run(["provider", "status"])).toMatchObject({
    code: 8,
    result: { data: null, exitCode: 8 },
  });
});
