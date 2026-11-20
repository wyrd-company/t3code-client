// ---
// relationships:
//   verifies: request-watch
// ---
/** The request watch at the start, live and with filters, against the fake orchestration. */
import { afterEach, describe, expect, it } from "vite-plus/test";
import { Harness, pause } from "../../test/support/requestWatchHarness.ts";
import { T3PreconditionError } from "../errors.ts";
import { projectId, threadId } from "../schemas/common.ts";

let harness: Harness;
afterEach(async () => {
  await harness?.close();
});

describe("client.requests.watch at the start", () => {
  it("reports every request pending at the start once, then synchronized", async () => {
    harness = await new Harness().start();
    const { fake } = harness;
    fake.createThread("thread-a");
    fake.raise("thread-a", "request-1");
    fake.raise("thread-a", "request-2");
    fake.createThread("thread-idle");
    fake.raise("thread-idle", "request-3");
    fake.settle("thread-idle", "request-3");
    const watcher = harness.watch();
    await watcher.until((w) => w.count("synchronized") === 1);
    await pause(200);
    // The summary names request-2 only; the thread watch finds both.
    expect(watcher.kinds).toEqual(["thread-a/request-1", "thread-a/request-2", "synchronized"]);
    expect(fake.streams.threadSubscriptions("thread-idle")).toBe(0);
  });

  it("does not report a request that settles before the thread watch sees it", async () => {
    harness = await new Harness().start();
    const { fake, server } = harness;
    fake.createThread("thread-a");
    fake.raise("thread-a", "request-1");
    server.routes.route("GET /api/orchestration/shell", () => {
      const body = fake.listing();
      fake.settle("thread-a", "request-1");
      return { status: 200, body };
    });
    const watcher = harness.watch();
    await watcher.until((w) => w.count("synchronized") === 1);
    await pause(200);
    expect(watcher.kinds).toEqual(["synchronized"]);
    expect(fake.streams.threadSubscriptions("thread-a")).toBe(1);
  });

  it("waits up to two seconds for a card, and synchronized waits for both reports", async () => {
    harness = await new Harness().start();
    const { fake } = harness;
    fake.createThread("thread-a");
    fake.raise("thread-a", "request-1", { card: false });
    fake.raise("thread-a", "request-2", { card: false });
    const started = Date.now();
    const watcher = harness.watch();
    setTimeout(() => fake.card("thread-a", "request-1"), 300);
    await watcher.until((w) => w.count("synchronized") === 1, 4_000);
    expect(watcher.kinds).toEqual(["thread-a/request-1", "thread-a/request-2", "synchronized"]);
    const [first, second] = watcher.items;
    expect(first?.kind === "request" && first.request.item?.requestId).toBe("request-1");
    expect(second?.kind === "request" && second.request.item).toBeUndefined();
    expect(watcher.times[0]! - started).toBeLessThan(1_500);
    expect(watcher.times[1]! - started).toBeGreaterThanOrEqual(1_900);

    // Answered during its card wait: reported once, with the status its view holds.
    fake.raise("thread-a", "request-3", { card: false });
    setTimeout(() => fake.settle("thread-a", "request-3"), 100);
    await watcher.until((w) => w.requests.length === 3, 4_000);
    const third = watcher.items.at(-1);
    expect(third?.kind === "request" && third.request.request.status).toBe("resolved");
  });
});

describe("client.requests.watch while synchronized", () => {
  it("covers a thread created after the start and reports within five seconds", async () => {
    harness = await new Harness().start();
    const { fake } = harness;
    const watcher = harness.watch();
    await watcher.until((w) => w.count("synchronized") === 1);
    fake.createThread("thread-new");
    await pause(1_000);
    const raisedAt = Date.now();
    fake.raise("thread-new", "request-1");
    await watcher.until((w) => w.requests.length === 1);
    expect(watcher.times.at(-1)! - raisedAt).toBeLessThan(5_000);
    expect(watcher.items.at(-1)).toMatchObject({
      kind: "request",
      request: {
        kind: "approval",
        requestId: "request-1",
        thread: { id: "thread-new", title: "Thread thread-new", tags: [] },
        project: { id: "project-1", title: "Sample project" },
        request: { status: "pending" },
        item: { type: "approval_request", requestId: "request-1" },
      },
    });
  });

  it("reports a question whose equal row the server holds back", async () => {
    harness = await new Harness().start();
    const { fake } = harness;
    fake.createThread("thread-a");
    fake.raise("thread-a", "request-1");
    const watcher = harness.watch();
    await watcher.until((w) => w.count("synchronized") === 1);
    // The summary still names the approval, so the row equals the last one sent.
    fake.raise("thread-a", "request-2", { kind: "user_input" });
    await watcher.until((w) => w.requests.length === 2);
    expect(watcher.items.at(-1)).toMatchObject({
      request: { kind: "user-input", questions: [{ id: "q1" }] },
    });
  });

  it("reports a new request after the thread's watch closed on its last row", async () => {
    harness = await new Harness().start();
    const { fake } = harness;
    fake.createThread("thread-a");
    fake.raise("thread-a", "request-1");
    const watcher = harness.watch();
    await watcher.until((w) => w.requests.length === 1);
    fake.settle("thread-a", "request-1");
    await pause(300);
    fake.raise("thread-a", "request-2");
    await watcher.until((w) => w.requests.length === 2);
    expect(fake.streams.threadSubscriptions("thread-a")).toBe(2);
    expect(watcher.requests).toEqual(["thread-a/request-1", "thread-a/request-2"]);
  });

  it("reports each request once across a watch that reopens and a re-sent request", async () => {
    harness = await new Harness().start();
    const { fake } = harness;
    fake.createThread("thread-a");
    fake.raise("thread-a", "request-1");
    const watcher = harness.watch({ excludeTags: ["paused"] });
    await watcher.until((w) => w.requests.length === 1);
    fake.resend("thread-a", "request-1");
    fake.setTags("thread-a", ["paused"]);
    await pause(300);
    fake.setTags("thread-a", []);
    await pause(300);
    expect(fake.streams.threadSubscriptions("thread-a")).toBe(2);
    expect(watcher.requests).toEqual(["thread-a/request-1"]);
  });

  it("reports a request again in a new run of the watch", async () => {
    harness = await new Harness().start();
    const { fake } = harness;
    fake.createThread("thread-a");
    fake.raise("thread-a", "request-1");
    const first = harness.watch();
    await first.until((w) => w.requests.length === 1);
    first.stop();
    await first.until((w) => w.done);
    expect(first.error).toBeUndefined();
    const second = harness.watch();
    await second.until((w) => w.count("synchronized") === 1);
    expect(second.kinds).toEqual(["thread-a/request-1", "synchronized"]);
  });
});

describe("client.requests.watch filters", () => {
  it("selects by project, kind, exact thread id and the thread's own tags", async () => {
    harness = await new Harness().start();
    const { fake } = harness;
    fake.createThread("thread-in");
    fake.createThread("thread-other-project", { projectId: "project-2" });
    fake.createThread("thread-reviewer", { tags: ["reviewer"] });
    fake.createThread("thread-excluded");
    for (const id of ["thread-in", "thread-other-project", "thread-reviewer", "thread-excluded"]) {
      fake.raise(id, `${id}-approval`);
      fake.raise(id, `${id}-question`, { kind: "user_input" });
    }
    const watcher = harness.watch({
      projectIds: [projectId("project-1")],
      kind: "approval",
      excludeThreadIds: [threadId("thread-excluded")],
      excludeTags: ["reviewer"],
    });
    await watcher.until((w) => w.count("synchronized") === 1);
    fake.createThread("thread-late");
    fake.raise("thread-late", "thread-late-approval");
    await watcher.until((w) => w.requests.length === 2);
    await pause(200);
    expect(watcher.requests).toEqual([
      "thread-in/thread-in-approval",
      "thread-late/thread-late-approval",
    ]);
    expect(fake.streams.threadSubscriptions("thread-excluded")).toBe(0);
  });

  it("excludes only the exact thread id, not its subagents", async () => {
    harness = await new Harness().start();
    const { fake } = harness;
    fake.createThread("thread-manager");
    fake.createThread("thread-worker", { parentThreadId: "thread-manager" });
    const watcher = harness.watch({ excludeThreadIds: [threadId("thread-manager")] });
    await watcher.until((w) => w.count("synchronized") === 1);
    fake.raise("thread-manager", "request-1");
    fake.raise("thread-worker", "request-2");
    await watcher.until((w) => w.requests.length === 1);
    await pause(200);
    expect(watcher.requests).toEqual(["thread-worker/request-2"]);
  });

  it("applies the filters to the thread record of the view, not the row", async () => {
    harness = await new Harness().start();
    const { fake, server } = harness;
    fake.createThread("thread-a", { tags: ["reviewer"] });
    fake.raise("thread-a", "request-1");
    server.routes.route("GET /api/orchestration/shell", () => {
      const body = fake.listing() as { threads: { tags?: string[] }[] };
      return {
        status: 200,
        body: { ...body, threads: body.threads.map((t) => ({ ...t, tags: [] })) },
      };
    });
    const watcher = harness.watch({ excludeTags: ["reviewer"] });
    await watcher.until((w) => w.count("synchronized") === 1);
    await pause(200);
    expect(fake.streams.threadSubscriptions("thread-a")).toBe(1);
    expect(watcher.requests).toEqual([]);
  });

  it("raises T3PreconditionError for a malformed option before it subscribes", async () => {
    harness = await new Harness().start();
    expect(() => harness.client.requests.watch({ excludeTags: ["a\nb"] })).toThrow(
      T3PreconditionError,
    );
    expect(harness.fake.streams.shellPayloads).toEqual([]);
  });
});
