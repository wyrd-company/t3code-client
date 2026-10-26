// ---
// relationships:
//   verifies: library-facades
// ---
import { afterEach, beforeEach, describe, expect, expectTypeOf, it } from "vite-plus/test";
import { FakeT3Server } from "../../test/support/fakeServer.ts";
import {
  T3AuthError,
  T3DecodeError,
  T3InterruptedError,
  T3PreconditionError,
  T3RpcError,
} from "../errors.ts";
import type { T3Client, WatchCommandOutputOptions as PublicOptions } from "../index.ts";
import { RpcClient } from "../rpc/client.ts";
import { rpcMethods, type RpcMethods } from "../rpc/registry.ts";
import type { RpcPayload, RpcSuccess } from "../rpc/spec.ts";
import type {
  OrchestrationV2CommandOutputFrame,
  OrchestrationV2SubscribeCommandOutputInput,
} from "../schemas/orchestration/commandOutput.ts";
import { HttpTransport } from "../transport/http.ts";
import { RpcConnection } from "../transport/rpcConnection.ts";
import { SocketTransport } from "../transport/socket.ts";
import { CommandDispatcher } from "./dispatch.ts";
import type { DecodedStreamItem } from "./streamItems.ts";
import { ThreadsApi, type WatchCommandOutputOptions } from "./threads.ts";

const METHOD = "orchestration.subscribeCommandOutput";
const input = {
  threadId: "thread-1",
  itemId: "item-1",
} as OrchestrationV2SubscribeCommandOutputInput;
const escaped = "\u001b[32mok\u001b[0m\r\n";
const replace = { kind: "replace", text: "", truncated: false, running: true };
const append = { kind: "append", text: escaped, truncated: true, running: true, next: "kept" };
const malformed = { kind: "append", text: 7, truncated: false, running: true };
const future = { kind: "a-future-kind", text: "later", truncated: false, running: true };
const finished = { kind: "replace", text: `${escaped}done`, truncated: false, running: false };
const failure = {
  _tag: "OrchestrationV2CommandOutputError",
  threadId: "thread-1",
  message: "No such command.",
};
// The first `next()`, where validation and scope failures surface; resolves to the failure.
const first = (items: AsyncIterable<unknown>): Promise<unknown> => {
  const iterator = items[Symbol.asyncIterator]();
  return iterator.next().catch((caught: unknown) => caught);
};
const until = async (check: () => boolean, ms = 3_000): Promise<void> => {
  const deadline = Date.now() + ms;
  while (!check()) {
    if (Date.now() > deadline) throw new Error("condition not met");
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
};

describe("orchestration.subscribeCommandOutput through rpc.stream and threads.watchCommandOutput", () => {
  let server: FakeT3Server;
  let connection: RpcConnection;
  let rpc: RpcClient<RpcMethods>;
  let threads: ThreadsApi;
  let received: unknown[];
  let scopes: readonly string[] | undefined;

  beforeEach(async () => {
    server = await FakeT3Server.start();
    received = [];
    scopes = undefined;
    connection = new RpcConnection(new SocketTransport({ url: async () => server.wsUrl }));
    rpc = new RpcClient(connection, rpcMethods, { getScopes: () => scopes });
    threads = new ThreadsApi(
      new HttpTransport({ baseUrl: server.httpUrl, getAccessToken: async () => undefined }),
      rpc,
      new CommandDispatcher(rpc),
    );
    server.handle(METHOD, (payload) => {
      received.push(payload);
      return { kind: "stream", chunks: [[replace], [append, malformed], [future], [finished]] };
    });
  });
  afterEach(async () => {
    await connection.close();
    await server.close();
  });

  // Both typed paths, normalised to the facade's item shape.
  const paths = (payload: unknown = input, signal?: AbortSignal) => {
    const options = signal === undefined ? undefined : { signal };
    const typed = payload as OrchestrationV2SubscribeCommandOutputInput;
    return [
      () => threads.watchCommandOutput(typed, options),
      async function* () {
        for await (const item of rpc.stream(METHOD, typed, options)) {
          yield item.kind === "item" ? item.value : item;
        }
      },
    ];
  };
  const requests = () =>
    server.connections
      .flatMap((c) => c.received)
      .filter((e) => e["_tag"] === "Request" && e["tag"] === METHOD);

  it("types the method and the public facade member", () => {
    expectTypeOf<
      RpcPayload<RpcMethods, typeof METHOD>
    >().toEqualTypeOf<OrchestrationV2SubscribeCommandOutputInput>();
    expectTypeOf<
      RpcSuccess<RpcMethods, typeof METHOD>
    >().toEqualTypeOf<OrchestrationV2CommandOutputFrame>();
    expectTypeOf<PublicOptions>().toEqualTypeOf<WatchCommandOutputOptions>();
    expectTypeOf<WatchCommandOutputOptions>().toEqualTypeOf<{ readonly signal?: AbortSignal }>();
    expectTypeOf<Parameters<T3Client["threads"]["watchCommandOutput"]>>().toEqualTypeOf<
      [OrchestrationV2SubscribeCommandOutputInput, (WatchCommandOutputOptions | undefined)?]
    >();
    expectTypeOf<ReturnType<T3Client["threads"]["watchCommandOutput"]>>().toEqualTypeOf<
      AsyncIterable<DecodedStreamItem<OrchestrationV2CommandOutputFrame>>
    >();
  });

  it("sends the normalised ids and decodes frames until the stream ends on both paths", async () => {
    for (const open of paths({ threadId: " thread-1 ", itemId: "item-1 ", future: "kept" })) {
      const items = [];
      for await (const item of open()) items.push(item);
      expect(items).toHaveLength(5);
      expect(items[0]).toEqual(replace);
      expect(items[1]).toEqual(append);
      expect(items[2]).toMatchObject({ kind: "decode-error" });
      expect((items[2] as { error: unknown }).error).toBeInstanceOf(T3DecodeError);
      expect(items[3]).toEqual(future);
      expect(items[4]).toEqual(finished);
    }
    expect(received).toEqual([
      { threadId: "thread-1", itemId: "item-1", future: "kept" },
      { threadId: "thread-1", itemId: "item-1", future: "kept" },
    ]);
    expect(server.lastConnection.interrupts).toEqual([]);
  });

  it("raises the typed command output error on both paths", async () => {
    server.handle(METHOD, () => ({
      kind: "stream",
      chunks: [],
      exit: { kind: "fail", error: failure },
    }));
    for (const open of paths()) {
      const error = await (async () => {
        for await (const _item of open()) throw new Error("no frame expected");
      })().catch((caught: unknown) => caught);
      expect(error).toBeInstanceOf(T3RpcError);
      const rpcError = error as T3RpcError;
      expect(rpcError.is("OrchestrationV2CommandOutputError")).toBe(true);
      if (rpcError.is("OrchestrationV2CommandOutputError")) {
        expect(rpcError.record.threadId).toBe("thread-1");
        expect(rpcError.record.message).toBe("No such command.");
      }
    }
  });

  it("rejects an invalid input before sending on both paths", async () => {
    for (const payload of [
      { threadId: "thread-1" },
      { threadId: "thread-1", itemId: "  " },
      { threadId: 7, itemId: "item-1" },
    ]) {
      for (const open of paths(payload)) {
        const error = await first(open());
        expect(error, JSON.stringify(payload)).toBeInstanceOf(T3PreconditionError);
      }
    }
    expect(requests()).toEqual([]);
  });

  it("checks orchestration:read against known credential scopes before sending", async () => {
    scopes = ["orchestration:operate"];
    for (const open of paths()) {
      const error = await first(open());
      expect(error).toBeInstanceOf(T3AuthError);
    }
    expect(requests()).toEqual([]);
    scopes = ["orchestration:read"];
    for (const open of paths()) {
      const items = [];
      for await (const item of open()) items.push(item);
      expect(items).toHaveLength(5);
    }
  });

  it("forwards the caller's abort signal on both paths", async () => {
    server.handle(METHOD, (payload) => {
      received.push(payload);
      return { kind: "hang" };
    });
    for (const index of [0, 1]) {
      const controller = new AbortController();
      const iterator = paths(input, controller.signal)[index]!()[Symbol.asyncIterator]();
      const pending = iterator.next();
      await until(() => received.length === index + 1);
      controller.abort();
      await expect(pending).rejects.toBeInstanceOf(T3InterruptedError);
    }
    await until(() => server.lastConnection.interrupts.length === 2);
  });

  it("sends an interrupt when the consumer returns early on both paths", async () => {
    server.handle(METHOD, (payload) => {
      received.push(payload);
      return { kind: "stream", chunks: [[replace], [append]] };
    });
    for (const open of paths()) {
      for await (const item of open()) {
        expect(item).toEqual(replace);
        break;
      }
    }
    await until(() => server.lastConnection.interrupts.length === 2);
  });
});
