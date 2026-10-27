// ---
// relationships:
//   verifies: library
// ---
import * as NodeFS from "node:fs";
import { afterEach, beforeEach, describe, expect, it } from "vite-plus/test";

import { FakeT3Server } from "../../test/support/fakeServer.ts";
import { T3AuthError, T3InterruptedError, T3PreconditionError, T3RpcError } from "../errors.ts";
import { RpcClient } from "../rpc/client.ts";
import { rpcMethods } from "../rpc/registry.ts";
import { usageDay } from "../schemas/usage.ts";
import { HttpTransport } from "../transport/http.ts";
import { RpcConnection } from "../transport/rpcConnection.ts";
import { SocketTransport } from "../transport/socket.ts";
import { ServerApi } from "./server.ts";

const serverConfig: unknown = JSON.parse(
  NodeFS.readFileSync(new URL("../../test/fixtures/server-config.json", import.meta.url), "utf8"),
);

const bucket = {
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
  costSource: "providerReported",
  records: 2,
  unpricedRecords: 0,
  sessions: 1,
};

const summary = {
  contractVersion: 6,
  readAt: "2026-01-03T00:00:00.000Z",
  timeZone: "Etc/UTC",
  sinceDay: "2026-01-01",
  untilDay: "2026-01-02",
  buckets: [bucket, { ...bucket, costSource: "estimatedLater", sampleExtra: true }, { day: 1 }],
  sources: [
    {
      fingerprint: {
        hostId: "host-sample",
        provider: "codex",
        resolvedHomePath: "/home/sample/.sample",
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
  pricing: { status: "cached", source: "sample-pricing", fetchedAt: null, knownModels: 4 },
  scanDurationMs: 12,
};

const input = {
  sinceDay: usageDay("2026-01-01"),
  untilDay: usageDay("2026-01-02"),
  timeZone: "Etc/UTC",
};

describe("ServerApi usage and provider status", () => {
  let server: FakeT3Server;
  let connection: RpcConnection;
  let scopes: readonly string[] | undefined;
  let api: ServerApi;
  let payloads: unknown[];

  beforeEach(async () => {
    server = await FakeT3Server.start();
    connection = new RpcConnection(new SocketTransport({ url: async () => server.wsUrl }));
    scopes = undefined;
    payloads = [];
    api = new ServerApi(
      new RpcClient(connection, rpcMethods, { getScopes: () => scopes }),
      new HttpTransport({ baseUrl: server.httpUrl, getAccessToken: async () => undefined }),
    );
    server.handle("server.getUsageSummary", (payload) => {
      payloads.push(payload);
      return { kind: "value", value: summary };
    });
  });

  afterEach(async () => {
    await connection.close();
    await server.close();
  });

  it("sends the required window and optional fields exactly", async () => {
    await api.usageSummary(input);
    const detailed = {
      ...input,
      resolution: "hour" as const,
      sinceTime: "08:00",
      untilTime: "17:00",
      awaitRefresh: true,
    };
    await api.usageSummary(detailed);
    expect(payloads).toEqual([input, detailed]);
  });

  it("keeps bucket provenance, newer cost sources and source diagnostics without totals", async () => {
    const result = await api.usageSummary(input);
    expect(result.buckets).toHaveLength(2);
    expect(result.buckets[1]).toMatchObject({ costSource: "estimatedLater", sampleExtra: true });
    expect(result.buckets[0]?.totals.reasoningTokens).toBe(3);
    expect(result.sources[0]).toMatchObject({ status: "partial", refreshing: true });
    expect(result.pricing).toEqual(summary.pricing);
    expect(Object.keys(result).sort()).toEqual(Object.keys(summary).sort());
  });

  it("rejects a malformed day or a missing time zone before sending", async () => {
    await expect(
      api.usageSummary({ ...input, sinceDay: "January" as never }),
    ).rejects.toBeInstanceOf(T3PreconditionError);
    await expect(
      // @ts-expect-error The time zone is required.
      api.usageSummary({ sinceDay: input.sinceDay, untilDay: input.untilDay }),
    ).rejects.toBeInstanceOf(T3PreconditionError);
    expect(server.connections).toHaveLength(0);
  });

  it("requires diagnostics:read when scopes are known", async () => {
    scopes = ["orchestration:read"];
    await expect(api.usageSummary(input)).rejects.toMatchObject({
      code: "insufficient_scope",
      requiredScope: "diagnostics:read",
    });
    await expect(api.usageSummary(input)).rejects.toBeInstanceOf(T3AuthError);
    expect(payloads).toEqual([]);
  });

  it("surfaces UsageReadError with its reason and detail", async () => {
    server.handle("server.getUsageSummary", () => ({
      kind: "fail",
      error: { _tag: "UsageReadError", reason: "invalidWindow", detail: "Window is reversed." },
    }));
    const failure = (await api.usageSummary(input).catch((e: unknown) => e)) as T3RpcError;
    expect(failure).toBeInstanceOf(T3RpcError);
    expect(failure.message).toContain("Window is reversed.");
    expect(failure.is("UsageReadError") && failure.record.reason).toBe("invalidWindow");
  });

  it("keeps a newer UsageReadError reason", async () => {
    server.handle("server.getUsageSummary", () => ({
      kind: "fail",
      error: { _tag: "UsageReadError", reason: "sourceLocked", detail: "Sample detail." },
    }));
    const failure = (await api.usageSummary(input).catch((e: unknown) => e)) as T3RpcError;
    expect(failure.is("UsageReadError") && failure.record.reason).toBe("sourceLocked");
  });

  it("forwards the abort signal", async () => {
    server.handle("server.getUsageSummary", (payload) => {
      payloads.push(payload);
      return { kind: "hang" };
    });
    const controller = new AbortController();
    const pending = api.usageSummary(input, controller.signal);
    while (payloads.length === 0) await new Promise((resolve) => setTimeout(resolve, 5));
    controller.abort();
    await expect(pending).rejects.toBeInstanceOf(T3InterruptedError);
  });

  it("reports provider records from the configuration, filtered by exact instance id", async () => {
    const configs: unknown[] = [];
    server.handle("server.getConfig", (payload) => {
      configs.push(payload);
      return { kind: "value", value: serverConfig };
    });
    const all = await api.providerStatus();
    expect(all.length).toBeGreaterThan(0);
    const first = all[0]!;
    const one = await api.providerStatus(first.instanceId);
    expect(one).toEqual([first]);
    expect(one[0]).toHaveProperty("auth");
    expect(one[0]).toHaveProperty("installed");
    await expect(api.providerStatus("absent-instance")).resolves.toEqual([]);
    // Only configuration reads: no refresh, login or reset call is made.
    expect(configs).toHaveLength(3);
    expect(server.connections[0]?.received.map((e) => e["tag"]).filter(Boolean)).toEqual([
      "server.getConfig",
      "server.getConfig",
      "server.getConfig",
    ]);
  });
});
