// ---
// relationships:
//   verifies: library-facades
// ---
import { afterEach, beforeEach, describe, expect, expectTypeOf, it } from "vite-plus/test";
import { FakeT3Server } from "../../test/support/fakeServer.ts";
import { T3DecodeError, T3InterruptedError } from "../errors.ts";
import type { T3Client } from "../index.ts";
import { RpcClient } from "../rpc/client.ts";
import { rpcMethods, type RpcMethods } from "../rpc/registry.ts";
import type { RpcPayload, RpcSuccess } from "../rpc/spec.ts";
import type { DatabaseStorageStatusUpdate } from "../schemas/server.ts";
import { HttpTransport } from "../transport/http.ts";
import { RpcConnection } from "../transport/rpcConnection.ts";
import { SocketTransport } from "../transport/socket.ts";
import { ServerApi, type WatchDatabaseStorageOptions } from "./server.ts";
import type { DecodedStreamItem } from "./streamItems.ts";

const METHOD = "server.getDatabaseStorage";
const status = {
  databaseBytes: 4096,
  reclaimableBytes: 1024,
  incrementalVacuumEnabled: true,
  compactCommand: "sample-cli doctor --base-dir /srv/sample",
};
const later = { ...status, reclaimableBytes: 0, incrementalVacuumEnabled: false, next: "kept" };
const until = async (check: () => boolean, ms = 3_000): Promise<void> => {
  const deadline = Date.now() + ms;
  while (!check()) {
    if (Date.now() > deadline) throw new Error("condition not met");
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
};

describe("server.getDatabaseStorage through rpc.stream and server.watchDatabaseStorage", () => {
  let server: FakeT3Server;
  let connection: RpcConnection;
  let rpc: RpcClient<RpcMethods>;
  let api: ServerApi;
  let received: unknown[];

  beforeEach(async () => {
    server = await FakeT3Server.start();
    received = [];
    connection = new RpcConnection(new SocketTransport({ url: async () => server.wsUrl }));
    rpc = new RpcClient(connection, rpcMethods);
    api = new ServerApi(
      rpc,
      new HttpTransport({ baseUrl: server.httpUrl, getAccessToken: async () => undefined }),
    );
    server.handle(METHOD, (payload) => {
      received.push(payload);
      return {
        kind: "stream",
        chunks: [[null], [status], [{ ...status, databaseBytes: "4096" }], [later]],
      };
    });
  });
  afterEach(async () => {
    await connection.close();
    await server.close();
  });

  // Both typed paths, normalised to the facade's item shape.
  const paths = (signal?: AbortSignal) => {
    const options = signal === undefined ? undefined : { signal };
    return [
      () => api.watchDatabaseStorage(options),
      async function* () {
        for await (const item of rpc.stream(METHOD, {}, options)) {
          yield item.kind === "item" ? item.value : item;
        }
      },
    ];
  };

  it("types the method and the public facade member", () => {
    expectTypeOf<RpcPayload<RpcMethods, typeof METHOD>>().toEqualTypeOf<{
      [key: string]: unknown;
    }>();
    expectTypeOf<
      RpcSuccess<RpcMethods, typeof METHOD>
    >().toEqualTypeOf<DatabaseStorageStatusUpdate>();
    expectTypeOf<Parameters<T3Client["server"]["watchDatabaseStorage"]>>().toEqualTypeOf<
      [(WatchDatabaseStorageOptions | undefined)?]
    >();
    expectTypeOf<ReturnType<T3Client["server"]["watchDatabaseStorage"]>>().toEqualTypeOf<
      AsyncIterable<DecodedStreamItem<DatabaseStorageStatusUpdate>>
    >();
  });

  it("sends an empty payload and decodes null, statuses and a malformed item on both paths", async () => {
    for (const open of paths()) {
      const items = [];
      for await (const item of open()) items.push(item);
      expect(items[0]).toBeNull();
      expect(items[1]).toEqual(status);
      expect(items[2]).toMatchObject({ kind: "decode-error" });
      expect((items[2] as { error: unknown }).error).toBeInstanceOf(T3DecodeError);
      expect(items[3]).toEqual(later);
      expect(items).toHaveLength(4);
    }
    expect(received).toEqual([{}, {}]);
    const requests = server.lastConnection.received.filter((e) => e["_tag"] === "Request");
    expect(requests.map((e) => e["tag"])).toEqual([METHOD, METHOD]);
  });

  it("forwards the caller's abort signal on both paths", async () => {
    server.handle(METHOD, (payload) => {
      received.push(payload);
      return { kind: "hang" };
    });
    let count = 0;
    for (const index of [0, 1]) {
      const controller = new AbortController();
      const iterator = paths(controller.signal)[index]!()[Symbol.asyncIterator]();
      const pending = iterator.next();
      count += 1;
      await until(() => received.length === count);
      controller.abort();
      await expect(pending).rejects.toBeInstanceOf(T3InterruptedError);
    }
    await until(() => server.lastConnection.interrupts.length === 2);
  });
});
