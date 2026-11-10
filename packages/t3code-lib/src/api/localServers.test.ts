import { afterEach, beforeEach, describe, expect, it } from "vite-plus/test";

import { T3ConnectionError } from "../errors.ts";
import { FakeT3Server } from "../../test/support/fakeServer.ts";
import { RpcClient } from "../rpc/client.ts";
import { rpcMethods } from "../rpc/registry.ts";
import { RpcConnection } from "../transport/rpcConnection.ts";
import { SocketTransport } from "../transport/socket.ts";
import { LocalServersApi } from "./localServers.ts";

const listener = {
  host: "127.0.0.1",
  port: 4173,
  url: "http://127.0.0.1:4173/",
  processName: "node",
  pid: 1234,
  terminal: null,
  agent: { threadId: "thread-1" },
};

const scan = (servers: unknown[]) => ({
  servers,
  scannedAt: "2026-01-01T00:00:00.000Z",
  configuredUrlProbing: true,
});

describe("LocalServersApi", () => {
  let server: FakeT3Server;
  let connection: RpcConnection;
  let api: LocalServersApi;

  beforeEach(async () => {
    server = await FakeT3Server.start();
    connection = new RpcConnection(new SocketTransport({ url: async () => server.wsUrl }));
    api = new LocalServersApi(new RpcClient(connection, rpcMethods));
  });

  afterEach(async () => {
    await connection.close();
    await server.close();
  });

  it("lists the listeners of the first scan and sends the configured URLs", async () => {
    let payload: unknown;
    server.handle("subscribeDiscoveredLocalServers", (input) => {
      payload = input;
      return { kind: "stream", chunks: [[scan([listener])], [scan([])]] };
    });

    await expect(api.list({ configuredUrls: ["http://127.0.0.1:4173/"] })).resolves.toMatchObject({
      servers: [listener],
    });
    expect(payload).toEqual({ configuredUrls: ["http://127.0.0.1:4173/"] });
  });

  it("sends an empty payload by default", async () => {
    let payload: unknown;
    server.handle("subscribeDiscoveredLocalServers", (input) => {
      payload = input;
      return { kind: "stream", chunks: [[scan([])]] };
    });

    await expect(api.list()).resolves.toMatchObject({ servers: [] });
    expect(payload).toEqual({});
  });

  it("fails when the stream ends before a scan", async () => {
    server.handle("subscribeDiscoveredLocalServers", () => ({ kind: "stream", chunks: [] }));

    const error = await api.list().catch((e) => e);
    expect(error).toBeInstanceOf(T3ConnectionError);
    expect((error as Error).message).toBe(
      "The discovered local server stream ended before its first item.",
    );
  });

  it("stops one listener by pid and port", async () => {
    let payload: unknown;
    server.handle("preview.stopLocalServer", (input) => {
      payload = input;
      return { kind: "value", value: null };
    });

    await expect(api.stop({ pid: 1234, port: 4173 })).resolves.toBeUndefined();
    expect(payload).toEqual({ pid: 1234, port: 4173 });
  });
});
