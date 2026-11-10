import { afterEach, beforeEach, describe, expect, it } from "vite-plus/test";

import { T3ConnectionError } from "../errors.ts";
import { FakeT3Server } from "../../test/support/fakeServer.ts";
import { RpcClient } from "../rpc/client.ts";
import { rpcMethods } from "../rpc/registry.ts";
import { RpcConnection } from "../transport/rpcConnection.ts";
import { SocketTransport } from "../transport/socket.ts";
import { DiagnosticsApi } from "./diagnostics.ts";

const none = { _id: "Option", _tag: "None" };

const report = {
  trigger: "manual",
  startedAt: "2026-01-01T00:00:00.000Z",
  finishedAt: "2026-01-01T00:00:01.000Z",
  entries: [],
  counts: { removed: 0, kept: 0, failed: 0 },
  omittedCount: 0,
  bytesFreed: 0,
};

describe("DiagnosticsApi", () => {
  let server: FakeT3Server;
  let connection: RpcConnection;
  let api: DiagnosticsApi;

  beforeEach(async () => {
    server = await FakeT3Server.start();
    connection = new RpcConnection(new SocketTransport({ url: async () => server.wsUrl }));
    api = new DiagnosticsApi(new RpcClient(connection, rpcMethods));
  });

  afterEach(async () => {
    await connection.close();
    await server.close();
  });

  it("reads the process tree", async () => {
    server.respond("server.getProcessDiagnostics", {
      serverPid: 10,
      readAt: "2026-01-01T00:00:00.000Z",
      processCount: 0,
      totalRssBytes: 0,
      totalCpuPercent: 0,
      processes: [],
      error: none,
    });

    await expect(api.processes()).resolves.toMatchObject({ serverPid: 10, processes: [] });
  });

  it("sends the history window and bucket", async () => {
    let payload: unknown;
    server.handle("server.getResourceTelemetryHistory", (input) => {
      payload = input;
      return { kind: "fail", error: { _tag: "SampleError" } };
    });

    await api.resourceHistory({ windowMs: 60_000, bucketMs: 10_000 }).catch(() => undefined);
    expect(payload).toEqual({ windowMs: 60_000, bucketMs: 10_000 });
  });

  it("reads the cleanup report from the first stream item", async () => {
    server.handle("server.getStorageCleanupReport", () => ({
      kind: "stream",
      chunks: [[report], [{ ...report, trigger: "automatic" }]],
    }));

    await expect(api.storageCleanupReport()).resolves.toEqual(report);
  });

  it("reads null before the first cleanup", async () => {
    server.handle("server.getStorageCleanupReport", () => ({ kind: "stream", chunks: [[null]] }));

    await expect(api.storageCleanupReport()).resolves.toBeNull();
  });

  it("fails when the report stream ends without an item", async () => {
    server.handle("server.getStorageCleanupReport", () => ({ kind: "stream", chunks: [] }));

    const error = await api.storageCleanupReport().catch((e) => e);
    expect(error).toBeInstanceOf(T3ConnectionError);
    expect((error as Error).message).toBe(
      "The storage cleanup report stream ended before its first item.",
    );
  });
});
