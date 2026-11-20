/**
 * A harness for request watch tests: a FakeT3Server serving a FakeOrchestration, a client with
 * fast backoff, and a watcher that collects a run's items so a test can wait on them.
 */
import { WebSocket } from "ws";
import { expect } from "vite-plus/test";
import { T3Client, type RequestWatchItem, type RequestWatchOptions } from "../../src/index.ts";
import type { WebSocketConstructor } from "../../src/internal/websocket.ts";
import { FakeOrchestration, type FakeOrchestrationOptions } from "./fakeOrchestration.ts";
import { FakeT3Server } from "./fakeServer.ts";

export const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export async function until(check: () => boolean, timeoutMs = 5_000): Promise<void> {
  const started = Date.now();
  while (!check() && Date.now() - started < timeoutMs) await pause(5);
  expect(check()).toBe(true);
}

/** Collects one run's items. */
export class Watcher {
  readonly items: RequestWatchItem[] = [];
  /** When each item arrived, by index. */
  readonly times: number[] = [];
  error: unknown;
  done = false;
  readonly controller = new AbortController();

  constructor(client: T3Client, options: RequestWatchOptions = {}) {
    const items = client.requests.watch({ ...options, signal: this.controller.signal });
    void (async () => {
      try {
        for await (const item of items) {
          this.items.push(item);
          this.times.push(Date.now());
        }
      } catch (error) {
        this.error = error;
      } finally {
        this.done = true;
      }
    })();
  }

  /** `thread/request` for each reported request, in order. */
  get requests(): string[] {
    return this.items.flatMap((item) =>
      item.kind === "request" ? [`${item.request.thread.id}/${item.request.requestId}`] : [],
    );
  }

  /** Each item as `thread/request` for a request, or its kind. */
  get kinds(): string[] {
    return this.items.map((item) =>
      item.kind === "request" ? `${item.request.thread.id}/${item.request.requestId}` : item.kind,
    );
  }

  count(kind: RequestWatchItem["kind"]): number {
    return this.items.filter((item) => item.kind === kind).length;
  }

  until(check: (watcher: this) => boolean, timeoutMs?: number): Promise<void> {
    return until(() => check(this), timeoutMs);
  }

  stop(): void {
    this.controller.abort();
  }
}

/** One fake server and its client; `restart` brings the server back on the same port. */
export class Harness {
  server!: FakeT3Server;
  client!: T3Client;
  readonly fake: FakeOrchestration;
  readonly watchers: Watcher[] = [];
  #port = 0;

  constructor(options: FakeOrchestrationOptions = {}) {
    this.fake = new FakeOrchestration(options);
  }

  async start(): Promise<this> {
    this.server = await FakeT3Server.start();
    this.#port = Number(new URL(this.server.httpUrl).port);
    this.fake.install(this.server);
    this.client = T3Client.create({
      baseUrl: this.server.httpUrl,
      accessToken: "sample-token",
      webSocket: WebSocket as unknown as WebSocketConstructor,
      backoff: { initialMs: 10, factor: 2, maxMs: 50 },
    });
    return this;
  }

  watch(options: RequestWatchOptions = {}): Watcher {
    const watcher = new Watcher(this.client, options);
    this.watchers.push(watcher);
    return watcher;
  }

  /** Takes the server away; HTTP and the socket are refused until `restart`. */
  async stopServer(): Promise<void> {
    await this.server.close();
  }

  async restart(): Promise<void> {
    this.server = await FakeT3Server.start({ port: this.#port });
    this.fake.install(this.server);
  }

  async close(): Promise<void> {
    for (const watcher of this.watchers) watcher.stop();
    await this.client.close();
    await this.server.close();
  }
}
