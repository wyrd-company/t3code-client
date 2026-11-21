// ---
// relationships:
//   verifies: request-watch
// ---
/** The request watch across drops, outages, server restarts, failures and the end of a run. */
import { afterEach, describe, expect, it } from "vite-plus/test";
import { Harness, pause, until } from "../../test/support/requestWatchHarness.ts";
import { T3AuthError, T3ConnectionError, T3RpcError } from "../errors.ts";

let harness: Harness;
afterEach(async () => {
  await harness?.close();
});

/** The kinds after the start's `synchronized`. */
const afterStart = (kinds: string[]) => kinds.slice(kinds.indexOf("synchronized") + 1);

describe("client.requests.watch across connection loss", () => {
  it("reports a request once across a dropped connection", async () => {
    harness = await new Harness().start();
    const { fake, server } = harness;
    fake.createThread("thread-a");
    fake.raise("thread-a", "request-1");
    const watcher = harness.watch();
    await watcher.until((w) => w.count("synchronized") === 1);
    server.dropAll();
    await watcher.until((w) => w.count("reconnected") === 1);
    fake.raise("thread-a", "request-2");
    await watcher.until((w) => w.requests.length === 2);
    expect(watcher.kinds).toEqual([
      "thread-a/request-1",
      "synchronized",
      "reconnected",
      "thread-a/request-2",
    ]);
  });

  it.each([
    ["the server replays", 1_000],
    ["the server answers snapshot-required", 3],
  ])("reports an outage's still-pending request after %s", async (_case, shellReplayLimit) => {
    harness = await new Harness({ shellReplayLimit }).start();
    const { fake } = harness;
    fake.createThread("thread-a");
    fake.createThread("thread-b");
    const watcher = harness.watch();
    await watcher.until((w) => w.count("synchronized") === 1);
    await harness.stopServer();
    fake.raise("thread-a", "request-1");
    fake.raise("thread-b", "request-2");
    fake.settle("thread-b", "request-2");
    await pause(100);
    await harness.restart();
    await watcher.until((w) => w.count("reconnected") === 1);
    await pause(200);
    expect(afterStart(watcher.kinds)).toEqual(["thread-a/request-1", "reconnected"]);
    const fallback = fake.streams.shellPayloads.some((p) => p["httpSnapshotFallback"] === true);
    expect(fallback).toBe(true);
    const required = fake.streams.shellPayloads.filter((p) => p["afterSequence"] === fake.sequence);
    expect(required.length > 0).toBe(shellReplayLimit < 1_000);
  });

  it("reports a request once across a server restart, and the run's new request", async () => {
    harness = await new Harness().start();
    const { fake } = harness;
    fake.createThread("thread-a");
    fake.raise("thread-a", "approval-1");
    fake.raise("thread-a", "question-1", { kind: "user_input" });
    const watcher = harness.watch();
    await watcher.until((w) => w.count("synchronized") === 1);
    await harness.stopServer();
    // Shutdown ends the approval; the question survives under its id; the run asks again.
    fake.settle("thread-a", "approval-1", "expired");
    fake.resend("thread-a", "question-1");
    fake.raise("thread-a", "approval-2");
    await harness.restart();
    await watcher.until((w) => w.count("reconnected") === 1);
    await pause(200);
    expect(watcher.kinds).toEqual([
      "thread-a/approval-1",
      "thread-a/question-1",
      "synchronized",
      "thread-a/approval-2",
      "reconnected",
    ]);
  });
});

describe("client.requests.watch replaying an open thread watch", () => {
  it("reports only what is still pending when the replay catches up", async () => {
    harness = await new Harness().start();
    const { fake } = harness;
    fake.createThread("thread-a");
    fake.raise("thread-a", "request-1");
    const watcher = harness.watch();
    await watcher.until((w) => w.count("synchronized") === 1);
    await harness.stopServer();
    fake.raise("thread-a", "outage-settled");
    fake.settle("thread-a", "outage-settled");
    fake.raise("thread-a", "outage-pending");
    await harness.restart();
    await watcher.until((w) => w.count("reconnected") === 1);
    await pause(200);
    expect(afterStart(watcher.kinds)).toEqual(["thread-a/outage-pending", "reconnected"]);
    // The open watch resumed from its cursor, so the gap came as replayed events.
    const resumed = fake.streams.threadPayloads.filter((p) => p["threadId"] === "thread-a");
    expect(resumed.map((p) => p["afterSequence"] !== undefined)).toEqual([false, true]);
  });
});

describe("client.requests.watch failures and ends", () => {
  it("names a failing thread watch, retries it, and holds synchronized back", async () => {
    harness = await new Harness().start();
    const { fake } = harness;
    fake.createThread("thread-a");
    fake.raise("thread-a", "request-1");
    fake.streams.threadFailures.set("thread-a", 2);
    const watcher = harness.watch();
    await watcher.until((w) => w.count("synchronized") === 1);
    expect(watcher.kinds).toEqual([
      "thread-error",
      "thread-error",
      "thread-a/request-1",
      "synchronized",
    ]);
    expect(watcher.items[0]).toMatchObject({ threadId: "thread-a", error: { code: "rpc_failed" } });
  });

  it("retries the start's listing until the server answers", async () => {
    harness = await new Harness().start();
    const { fake, server } = harness;
    fake.createThread("thread-a");
    fake.raise("thread-a", "request-1");
    let refusals = 2;
    server.routes.route("GET /api/orchestration/shell", () =>
      refusals-- > 0
        ? { status: 503, body: { error: "unavailable" } }
        : { status: 200, body: fake.listing() },
    );
    const watcher = harness.watch();
    await watcher.until((w) => w.count("synchronized") === 1);
    expect(watcher.kinds).toEqual(["thread-a/request-1", "synchronized"]);
  });

  it("ends quietly on abort and with the closed connection error on client.close()", async () => {
    harness = await new Harness().start();
    const aborted = harness.watch();
    await aborted.until((w) => w.count("synchronized") === 1);
    aborted.stop();
    await aborted.until((w) => w.done);
    expect(aborted.error).toBeUndefined();

    const closed = harness.watch();
    await closed.until((w) => w.count("synchronized") === 1);
    await harness.client.close();
    await closed.until((w) => w.done);
    expect(closed.error).toBeInstanceOf(T3ConnectionError);
    expect((closed.error as T3ConnectionError).reason).toBe("closed");
  });

  it("ends with the connection error when the server rejects the credential", async () => {
    harness = await new Harness().start();
    const { server } = harness;
    const watcher = harness.watch();
    await watcher.until((w) => w.count("synchronized") === 1);
    server.routes.route("POST /api/auth/websocket-ticket", () => ({
      status: 401,
      body: { error: "invalid_credential" },
    }));
    server.dropAll();
    await watcher.until((w) => w.done);
    expect(watcher.error).toBeInstanceOf(T3ConnectionError);
    expect((watcher.error as T3ConnectionError).reason).toBe("open_failed");
  });

  it("ends with the error when the listing's credential is rejected", async () => {
    harness = await new Harness().start();
    harness.server.routes.route("GET /api/orchestration/shell", () => ({
      status: 401,
      body: { error: "invalid_credential" },
    }));
    const watcher = harness.watch();
    await watcher.until((w) => w.done);
    expect(watcher.error).toBeInstanceOf(T3AuthError);
  });

  it("ends with the error when a subscription is refused for authorization", async () => {
    harness = await new Harness().start();
    const { fake, server } = harness;
    fake.createThread("thread-a");
    fake.raise("thread-a", "request-1");
    server.handle("orchestration.subscribeThread", () => ({
      kind: "fail",
      error: { _tag: "EnvironmentAuthorizationError", message: "Missing scope." },
    }));
    const watcher = harness.watch();
    await watcher.until((w) => w.done);
    expect(watcher.error).toBeInstanceOf(T3RpcError);
    expect(watcher.kinds).toEqual([]);
  });

  it("stops its subscriptions when aborted while the consumer holds an item", async () => {
    harness = await new Harness().start();
    const { fake } = harness;
    fake.createThread("thread-a");
    fake.raise("thread-a", "request-1");
    const controller = new AbortController();
    const items = harness.client.requests.watch({ signal: controller.signal });
    const iterator = items[Symbol.asyncIterator]();
    expect((await iterator.next()).value).toMatchObject({ kind: "request" });
    expect((await iterator.next()).value).toMatchObject({ kind: "synchronized" });
    expect([fake.streams.liveShells, fake.streams.liveThreads]).toEqual([1, 1]);
    controller.abort();
    await until(() => fake.streams.liveShells === 0 && fake.streams.liveThreads === 0);
    expect(await iterator.next()).toEqual({ done: true, value: undefined });
  });

  it("stops its subscriptions when the consumer stops iterating", async () => {
    harness = await new Harness().start();
    const { fake } = harness;
    fake.createThread("thread-a");
    fake.raise("thread-a", "request-1");
    for await (const item of harness.client.requests.watch()) {
      if (item.kind === "synchronized") break;
    }
    await until(() => fake.streams.liveShells === 0 && fake.streams.liveThreads === 0);
  });
});
