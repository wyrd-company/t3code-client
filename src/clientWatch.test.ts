// ---
// relationships:
//   verifies: design
// ---
import { afterEach, describe, expect, it } from "vite-plus/test";
import { WebSocket } from "ws";
import { FakeT3Server } from "../test/support/fakeServer.ts";
import {
  events,
  ids,
  makeThread,
  makeSnapshot,
  makeShellSnapshot,
  makeShellThread,
} from "../test/support/threadFixtures.ts";
import type { WebSocketConstructor } from "./internal/websocket.ts";
import { T3Client, T3AuthError } from "./index.ts";

let server: FakeT3Server | undefined;
let client: T3Client | undefined;
const delays: number[] = [];
const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const until = async (check: () => boolean) => {
  for (let i = 0; i < 500 && !check(); i++) await pause(5);
  expect(check()).toBe(true);
};
const make = (baseUrl: string, options: { fetch?: typeof fetch } = {}) => {
  client = T3Client.create({
    baseUrl,
    accessToken: "sample-token",
    webSocket: WebSocket as unknown as WebSocketConstructor,
    fetch: async () =>
      new Response(
        JSON.stringify({ ticket: "sample-ticket", expiresAt: "2020-01-01T00:00:00.000Z" }),
      ),
    ...options,
    backoff: { initialMs: 10, factor: 2, maxMs: 40 },
    logger: {
      debug() {},
      warn() {},
      error() {},
      info(_message, fields) {
        if (typeof fields?.["delayMs"] === "number") delays.push(fields["delayMs"]);
      },
    },
  });
  return client;
};
afterEach(async () => {
  await client?.close();
  await server?.close();
  delays.length = 0;
});

describe.each(["thread", "shell"] as const)("public %s watch", (kind) => {
  const watch = (c: T3Client, signal?: AbortSignal) =>
    kind === "thread"
      ? c.threads.watch(ids.threadId, signal ? { signal } : {})
      : c.shell.watch(signal ? { signal } : {});
  const method =
    kind === "thread" ? "orchestration.subscribeThread" : "orchestration.subscribeShell";
  const snapshot = {
    kind: "snapshot",
    snapshot:
      kind === "thread"
        ? makeSnapshot(makeThread(), 10)
        : makeShellSnapshot({ snapshotSequence: 10 }),
  };
  const event = (sequence: number) =>
    kind === "thread"
      ? { kind: "event", event: events.sessionSet(sequence, { status: "ready" }) }
      : { kind: "thread-upserted", sequence, thread: makeShellThread() };

  it("waits for a server that starts later and resumes its cursor across an outage", async () => {
    server = await FakeT3Server.start();
    const baseUrl = server.httpUrl;
    const port = Number(new URL(baseUrl).port);
    await server.close();
    server = undefined;
    const c = make(baseUrl);
    const iterator = watch(c)[Symbol.asyncIterator]();
    const first = iterator.next();
    void first.catch(() => {});
    await until(() => delays.length >= 3);
    expect(delays.slice(0, 3)).toEqual([10, 20, 40]);
    server = await FakeT3Server.start({ port });
    server.handle(method, (_payload, context) => {
      context.connection.send({
        _tag: "Chunk",
        requestId: context.requestId,
        values: [snapshot, event(11)],
      });
      return { kind: "hang" };
    });
    expect((await first).value).toMatchObject({ kind: "snapshot" });
    expect((await iterator.next()).value).toMatchObject(
      kind === "thread" ? { kind: "event", event: { sequence: 11 } } : { sequence: 11 },
    );
    const next = iterator.next();
    void next.catch(() => {});
    await server.close();
    server = undefined;
    await until(() => delays.length >= 6);
    server = await FakeT3Server.start({ port });
    let payload: unknown;
    server.handle(method, (input) => {
      payload = input;
      return { kind: "stream", chunks: [[event(11), event(12), event(13)]] };
    });
    expect((await next).value).toEqual({ kind: "reconnected", afterSequence: 11 });
    const sequences: number[] = [];
    for (;;) {
      const result = await iterator.next();
      if (result.done) break;
      const value = result.value;
      if (value.kind === "event" && "sequence" in value.event)
        sequences.push(value.event.sequence as number);
      if (value.kind === "thread-upserted") sequences.push(value.sequence);
    }
    expect(payload).toMatchObject({ afterSequence: 11 });
    expect(sequences).toEqual([12, 13]);
  });

  it("retries more than two subscriptions that disconnect before delivering an item", async () => {
    server = await FakeT3Server.start();
    const c = make(server.httpUrl);
    let attempts = 0;
    server.handle(method, (_payload, context) => {
      attempts++;
      if (attempts < 4) {
        context.connection.close(1011);
        return { kind: "hang" };
      }
      return { kind: "stream", chunks: [[snapshot]] };
    });
    const items = [];
    for await (const item of watch(c)) items.push(item.kind);
    expect(attempts).toBe(4);
    expect(items).toEqual(["reconnected", "snapshot"]);
    expect(delays).toEqual([10, 10, 10]);
  });

  it("ends quietly when aborted while the server is down", async () => {
    server = await FakeT3Server.start();
    const baseUrl = server.httpUrl;
    await server.close();
    server = undefined;
    const controller = new AbortController();
    const next = watch(make(baseUrl), controller.signal)[Symbol.asyncIterator]().next();
    await until(() => delays.length >= 2);
    controller.abort();
    expect(await next).toMatchObject({ done: true });
  });

  it.each(["upgrade", "policy-close", "ticket"] as const)(
    "ends on credential rejection: %s",
    async (failure) => {
      server = await FakeT3Server.start(failure === "upgrade" ? { token: "different-token" } : {});
      const c = make(server.httpUrl);
      if (failure === "ticket")
        server.routes.route("POST /api/auth/websocket-ticket", () => ({ status: 401 }));
      if (failure === "ticket") {
        await c.close();
        client = T3Client.create({
          baseUrl: server.httpUrl,
          accessToken: "sample-token",
          webSocket: WebSocket as unknown as WebSocketConstructor,
          fetch: server.fetch,
        });
      }
      server.handle(method, (_payload, context) => {
        context.connection.close(1008);
        return { kind: "hang" };
      });
      const next = watch(client!)[Symbol.asyncIterator]().next();
      const error = await next.catch((error: unknown) => error);
      expect(error).toMatchObject({ code: "connection", reason: "open_failed" });
      if (failure === "ticket")
        expect((error as { cause: unknown }).cause).toBeInstanceOf(T3AuthError);
      expect(delays).toEqual([]);
    },
  );
});

it("propagates a resume detail connection error while the socket remains open", async () => {
  server = await FakeT3Server.start();
  server.routes.route("POST /api/auth/websocket-ticket", () => ({
    status: 200,
    body: { ticket: server!.issueTicket(), expiresAt: "2020-01-01T00:00:00.000Z" },
  }));
  let subscriptions = 0;
  server.handle("orchestration.subscribeThread", () => {
    subscriptions += 1;
    return {
      kind: "stream",
      chunks: [
        [
          {
            kind: "event",
            event: events.sessionSet(11, { status: "ready" }),
          },
        ],
      ],
    };
  });
  const detailFailure = new Error("Connection refused.");
  let detailReads = 0;
  const fakeFetch = server.fetch;
  const c = make(server.httpUrl, {
    fetch: async (input, init) => {
      if (new URL(String(input)).pathname === `/api/orchestration/threads/${ids.threadId}`) {
        detailReads += 1;
        throw detailFailure;
      }
      return fakeFetch(input, init);
    },
  });
  const controller = new AbortController();
  const watch = c.threads.watch(ids.threadId, {
    afterSequence: 10,
    signal: controller.signal,
  });
  const iterator = watch[Symbol.asyncIterator]();
  try {
    await expect(iterator.next()).rejects.toMatchObject({
      code: "connection",
      reason: "open_failed",
      cause: detailFailure,
    });
    // A failed watch cannot emit a later reconnected item or resubscribe.
    expect(await iterator.next()).toMatchObject({ done: true });
    expect(subscriptions).toBe(1);
    expect(detailReads).toBe(1);
    expect(delays).toEqual([]);
    expect(server.connections).toHaveLength(1);
    await c.connect();
    expect(server.connections).toHaveLength(1);
  } finally {
    controller.abort();
    await iterator.return?.();
  }
});
