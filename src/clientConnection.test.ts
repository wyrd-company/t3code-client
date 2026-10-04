// ---
// relationships:
//   verifies: design
// ---
import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import {
  ids,
  makeThread,
  makeSnapshot,
  makeShellSnapshot,
} from "../test/support/threadFixtures.ts";
import type { WebSocketConstructor } from "./internal/websocket.ts";
import { T3Client, type BackoffPolicy } from "./index.ts";

class FakeSocket extends EventTarget {
  static sockets: FakeSocket[] = [];
  readyState = 0;
  readonly sent: string[] = [];
  onSend?: (text: string) => void;
  constructor(_url: string) {
    super();
    FakeSocket.sockets.push(this);
  }
  send(text: string): void {
    this.sent.push(text);
    this.onSend?.(text);
  }
  open(): void {
    this.readyState = 1;
    this.dispatchEvent(new Event("open"));
  }
  message(value: unknown): void {
    this.dispatchEvent(new MessageEvent("message", { data: JSON.stringify(value) }));
  }
  close(): void {
    this.readyState = 3;
    this.dispatchEvent(new Event("close"));
  }
}

const fetchTicket: typeof fetch = async () =>
  new Response(JSON.stringify({ ticket: "sample-ticket", expiresAt: "2020-01-01T00:00:00.000Z" }));
const backoff: BackoffPolicy = { initialMs: 40, factor: 2, maxMs: 100, jitter: 0.4 };
let client: T3Client | undefined;
const make = (options: Partial<Parameters<typeof T3Client.create>[0]> = {}) => {
  client = T3Client.create({
    baseUrl: "http://127.0.0.1:12345",
    accessToken: "sample-token",
    fetch: fetchTicket,
    webSocket: FakeSocket as unknown as WebSocketConstructor,
    ...options,
  });
  return client;
};
const tick = (ms: number) => vi.advanceTimersByTimeAsync(ms);
const socket = () => FakeSocket.sockets.at(-1)!;

afterEach(async () => {
  await client?.close();
  vi.useRealTimers();
  vi.restoreAllMocks();
  FakeSocket.sockets = [];
});

describe("public client connection timing", () => {
  it("passes every backoff field through and resets after opening", async () => {
    vi.useFakeTimers();
    vi.spyOn(Math, "random").mockReturnValue(1);
    const c = make({ backoff });
    const connected = c.connect();
    void connected.catch(() => {});
    await tick(0);
    for (const delay of [48, 96, 120]) {
      const count = FakeSocket.sockets.length;
      socket().close();
      await tick(delay - 1);
      expect(FakeSocket.sockets).toHaveLength(count);
      await tick(1);
      expect(FakeSocket.sockets).toHaveLength(count + 1);
    }
    socket().open();
    await connected;
    socket().close();
    await tick(48);
    expect(FakeSocket.sockets).toHaveLength(5);
  });

  it("pings at the given interval and drops after the given missed pong limit", async () => {
    vi.useFakeTimers();
    const connected = make({ pingIntervalMs: 30, missedPongLimit: 2, backoff }).connect();
    await tick(0);
    const first = socket();
    first.open();
    await connected;
    await tick(29);
    expect(first.sent).toEqual([]);
    await tick(1);
    expect(first.sent).toEqual(['{"_tag":"Ping"}']);
    await tick(30);
    expect(first.sent).toHaveLength(2);
    expect(first.readyState).toBe(1);
    await tick(30);
    expect(first.readyState).toBe(3);
  });

  it("abandons a stalled open and retries after backoff, ignoring stale events", async () => {
    vi.useFakeTimers();
    const connected = make({ openTimeoutMs: 50, backoff: { ...backoff, jitter: 0 } }).connect();
    void connected.catch(() => {});
    await tick(0);
    const first = socket();
    await tick(49);
    expect(first.readyState).toBe(0);
    await tick(1);
    expect(first.readyState).toBe(3);
    first.open();
    await tick(39);
    expect(FakeSocket.sockets).toHaveLength(1);
    await tick(1);
    expect(FakeSocket.sockets).toHaveLength(2);
    socket().open();
    await connected;
    await tick(50);
    expect(socket().readyState).toBe(1);
  });

  it.each(["thread", "shell"] as const)(
    "keeps a %s watch waiting through open timeouts until abort",
    async (kind) => {
      vi.useFakeTimers();
      const c = make({ openTimeoutMs: 50, backoff: { ...backoff, jitter: 0 } });
      const controller = new AbortController();
      const iterator = (
        kind === "thread"
          ? c.threads.watch(ids.threadId, { signal: controller.signal })
          : c.shell.watch({ signal: controller.signal })
      )[Symbol.asyncIterator]();
      const next = iterator.next();
      void next.catch(() => {});
      // Three stalled opens, each followed by growing backoff.
      await tick(50 + 40 + 50 + 80 + 50 + 100);
      expect(FakeSocket.sockets).toHaveLength(4);
      socket().onSend = (text) => {
        const request = JSON.parse(text) as { _tag: string; id: string };
        if (request._tag === "Request")
          socket().message({
            _tag: "Chunk",
            requestId: request.id,
            values: [
              {
                kind: "snapshot",
                snapshot:
                  kind === "thread"
                    ? makeSnapshot(makeThread(), 10)
                    : makeShellSnapshot({ snapshotSequence: 10 }),
              },
            ],
          });
      };
      socket().open();
      expect((await next).value).toMatchObject({ kind: "snapshot" });
      const pending = iterator.next();
      controller.abort();
      expect(await pending).toMatchObject({ done: true });
    },
  );

  it("clears the pending open timeout when the client closes", async () => {
    vi.useFakeTimers();
    const c = make({ openTimeoutMs: 50 });
    const connected = c.connect();
    const rejected = expect(connected).rejects.toMatchObject({ reason: "closed" });
    await tick(0);
    await c.close();
    await rejected;
    expect(vi.getTimerCount()).toBe(0);
    await tick(60_000);
    expect(FakeSocket.sockets).toHaveLength(1);
  });

  it("clears the old open timeout when credentials request a reconnect", async () => {
    vi.useFakeTimers();
    const c = make({
      openTimeoutMs: 50,
      fetch: async (input) =>
        new Response(
          JSON.stringify(
            String(input).endsWith("/api/auth/session")
              ? {
                  authenticated: true,
                  auth: {
                    policy: "remote-reachable",
                    bootstrapMethods: ["one-time-token"],
                    sessionMethods: ["bearer-access-token"],
                    sessionCookieName: "session",
                  },
                  scopes: ["orchestration:read"],
                }
              : { ticket: "sample-ticket", expiresAt: "2020-01-01T00:00:00.000Z" },
          ),
        ),
    });
    const connected = c.connect();
    void connected.catch(() => {});
    await tick(20);
    const first = socket();
    await c.auth.setAccessToken("replacement-token");
    await tick(0);
    expect(first.readyState).toBe(3);
    expect(FakeSocket.sockets).toHaveLength(2);
    expect(vi.getTimerCount()).toBe(1);
    await tick(30);
    expect(socket().readyState).toBe(0);
    socket().open();
    await connected;
  });

  it("keeps the default backoff, heartbeat, and unbounded open wait", async () => {
    vi.useFakeTimers();
    vi.spyOn(Math, "random").mockReturnValue(0.5);
    const connected = make().connect();
    await tick(60_000);
    expect(FakeSocket.sockets).toHaveLength(1);
    expect(socket().readyState).toBe(0);
    socket().open();
    await connected;
    const first = socket();
    await tick(4_999);
    expect(first.sent).toEqual([]);
    await tick(10_001);
    expect(first.sent).toHaveLength(3);
    expect(first.readyState).toBe(1);
    await tick(5_000);
    expect(first.readyState).toBe(3);
    await tick(499);
    expect(FakeSocket.sockets).toHaveLength(1);
    await tick(1);
    expect(FakeSocket.sockets).toHaveLength(2);
  });
});
