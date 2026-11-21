// ---
// relationships:
//   verifies: request-watch
// ---
/** The request watch and archived threads: removals, rechecks at a resync, and failures. */
import { afterEach, describe, expect, it } from "vite-plus/test";
import { Harness, pause } from "../../test/support/requestWatchHarness.ts";
import { threadId } from "../schemas/common.ts";

let harness: Harness;
afterEach(async () => {
  await harness?.close();
});

const afterStart = (kinds: string[]) => kinds.slice(kinds.indexOf("synchronized") + 1);

/** Events on a thread the test does not watch, to pass the shell's replay window. */
const filler = (harness: Harness, count: number) => {
  for (let i = 0; i < count; i++) harness.fake.touch("thread-filler");
};

describe("client.requests.watch and archived threads", () => {
  it("reports a request an archived thread raises while the watch runs", async () => {
    harness = await new Harness().start();
    const { fake } = harness;
    fake.createThread("thread-a");
    const watcher = harness.watch();
    await watcher.until((w) => w.count("synchronized") === 1);
    fake.archive("thread-a");
    await pause(300);
    fake.raise("thread-a", "request-1");
    await watcher.until((w) => w.requests.length === 1);
    expect(watcher.requests).toEqual(["thread-a/request-1"]);
  });

  it("leaves out a request already pending in an archived thread at the start", async () => {
    harness = await new Harness().start();
    const { fake } = harness;
    fake.createThread("thread-a");
    fake.raise("thread-a", "request-1", { kind: "user_input" });
    fake.archive("thread-a");
    const watcher = harness.watch();
    await watcher.until((w) => w.count("synchronized") === 1);
    await pause(200);
    expect(watcher.kinds).toEqual(["synchronized"]);
    expect(fake.forbidden).toEqual([]);
  });

  it("rechecks a thread archived during an outage past the replay window", async () => {
    harness = await new Harness({ shellReplayLimit: 3 }).start();
    const { fake } = harness;
    fake.createThread("thread-a");
    fake.createThread("thread-filler");
    const watcher = harness.watch();
    await watcher.until((w) => w.count("synchronized") === 1);
    await harness.stopServer();
    fake.archive("thread-a");
    fake.raise("thread-a", "request-1");
    filler(harness, 3);
    await harness.restart();
    await watcher.until((w) => w.count("reconnected") === 1);
    expect(afterStart(watcher.kinds)).toEqual(["thread-a/request-1", "reconnected"]);
  });

  it.each([
    ["rechecks a thread removed before the gap", [], ["thread-t/request-1", "reconnected"], 2],
    ["gives an excluded thread no recheck", ["thread-t"], ["reconnected"], 0],
  ])("%s", async (_case, excluded, expected, subscriptions) => {
    harness = await new Harness({ shellReplayLimit: 4 }).start();
    const { fake } = harness;
    fake.createThread("thread-t");
    fake.createThread("thread-filler");
    const watcher = harness.watch({ excludeThreadIds: excluded.map((id) => threadId(id)) });
    await watcher.until((w) => w.count("synchronized") === 1);
    fake.archive("thread-t");
    await pause(300);
    // The removal opened a thread watch, which closed on its idle view.
    expect(fake.streams.threadSubscriptions("thread-t")).toBe(Math.min(subscriptions, 1));
    await harness.stopServer();
    fake.unarchive("thread-t");
    fake.run("thread-t", "run-2", "running");
    fake.archive("thread-t");
    fake.raise("thread-t", "request-1");
    filler(harness, 2);
    await harness.restart();
    await watcher.until((w) => w.count("reconnected") === 1);
    await pause(200);
    expect(afterStart(watcher.kinds)).toEqual(expected);
    expect(fake.streams.threadSubscriptions("thread-t")).toBe(subscriptions);
  });

  it("takes every removal in a replay as a trigger, also for a thread held as removed", async () => {
    harness = await new Harness().start();
    const { fake } = harness;
    fake.createThread("thread-t");
    const watcher = harness.watch();
    await watcher.until((w) => w.count("synchronized") === 1);
    fake.archive("thread-t");
    await pause(300);
    await harness.stopServer();
    fake.raise("thread-t", "request-1");
    await harness.restart();
    await watcher.until((w) => w.count("reconnected") === 1);
    expect(afterStart(watcher.kinds)).toEqual(["thread-t/request-1", "reconnected"]);
  });

  it("subscribes a watched archived thread again after an outage past the shell's window", async () => {
    harness = await new Harness({ shellReplayLimit: 8 }).start();
    const { fake } = harness;
    fake.createThread("thread-t");
    fake.createThread("thread-filler");
    fake.run("thread-t", "run-1", "running");
    fake.archive("thread-t");
    const watcher = harness.watch();
    await watcher.until((w) => w.count("synchronized") === 1);
    fake.touch("thread-t");
    await watcher.until(() => fake.streams.threadSubscriptions("thread-t") === 1);
    await harness.stopServer();
    fake.run("thread-t", "run-1", "completed");
    fake.unarchive("thread-t");
    fake.run("thread-t", "run-2", "running");
    fake.archive("thread-t");
    fake.raise("thread-t", "request-1");
    filler(harness, 4);
    await harness.restart();
    await watcher.until((w) => w.count("reconnected") === 1);
    await pause(200);
    expect(afterStart(watcher.kinds)).toEqual(["thread-t/request-1", "reconnected"]);
  });

  it("rechecks a live archived thread's watch when the shell watch fails", async () => {
    harness = await new Harness().start();
    const { fake } = harness;
    fake.createThread("thread-t");
    fake.run("thread-t", "run-1", "running");
    const watcher = harness.watch();
    await watcher.until((w) => w.count("synchronized") === 1);
    fake.archive("thread-t");
    await watcher.until(() => fake.streams.threadSubscriptions("thread-t") === 1);
    await pause(200);
    // The thread watch has not applied these when the shell watch fails.
    fake.streams.pause("thread-t");
    fake.run("thread-t", "run-1", "completed");
    fake.unarchive("thread-t");
    fake.run("thread-t", "run-2", "running");
    fake.archive("thread-t");
    fake.raise("thread-t", "request-1");
    fake.streams.failShells();
    await watcher.until((w) => w.count("reconnected") === 1);
    expect(afterStart(watcher.kinds)).toEqual(["thread-t/request-1", "reconnected"]);
    fake.streams.release("thread-t");
    await pause(200);
    expect(watcher.requests).toEqual(["thread-t/request-1"]);
  });

  it("keeps a watch open until its view reaches a removal that arrived ahead of it", async () => {
    harness = await new Harness().start();
    const { fake } = harness;
    fake.createThread("thread-t");
    fake.run("thread-t", "run-1", "running");
    fake.archive("thread-t");
    const watcher = harness.watch();
    await watcher.until((w) => w.count("synchronized") === 1);
    fake.touch("thread-t");
    await watcher.until(() => fake.streams.threadSubscriptions("thread-t") === 1);
    await pause(200);
    fake.streams.pause("thread-t");
    fake.run("thread-t", "run-1", "completed");
    fake.run("thread-t", "run-2", "running");
    fake.raise("thread-t", "request-1");
    await pause(300);
    fake.streams.release("thread-t");
    await watcher.until((w) => w.requests.length === 1);
    expect(fake.streams.threadSubscriptions("thread-t")).toBe(1);
  });

  it.each([
    ["the thread exists", false, ["thread-error", "thread-t/request-1", "reconnected"], 2],
    ["the server holds no such thread", true, ["thread-error", "reconnected"], 1],
  ])("retries a failed subscription for a removal when %s", async (_c, forgotten, expected, n) => {
    harness = await new Harness().start();
    const { fake } = harness;
    fake.createThread("thread-t");
    const watcher = harness.watch();
    await watcher.until((w) => w.count("synchronized") === 1);
    await harness.stopServer();
    fake.archive("thread-t");
    fake.raise("thread-t", "request-1");
    fake.streams.threadFailures.set("thread-t", 1);
    if (forgotten) fake.threads.get("thread-t")!.forgotten = true;
    await harness.restart();
    await watcher.until((w) => w.count("reconnected") === 1);
    await pause(300);
    expect(afterStart(watcher.kinds)).toEqual(expected);
    expect(fake.streams.threadSubscriptions("thread-t")).toBe(n);
  });

  it.each([
    ["with no request waiting", false, ["thread-error", "reconnected"]],
    [
      "with a request waiting for its card",
      true,
      ["thread-error", "thread-t/request-1", "reconnected"],
    ],
  ])(
    "closes the watch of a thread the server no longer holds, %s",
    async (_c, waiting, expected) => {
      harness = await new Harness().start();
      const { fake } = harness;
      fake.createThread("thread-t");
      fake.run("thread-t", "run-1", "running");
      const watcher = harness.watch();
      await watcher.until((w) => w.count("synchronized") === 1);
      fake.archive("thread-t");
      await watcher.until(() => fake.streams.threadSubscriptions("thread-t") === 1);
      await pause(200);
      if (waiting) {
        fake.raise("thread-t", "request-1", { card: false });
        await pause(200);
      }
      // The open watch's view still holds the running run when the thread goes away.
      fake.threads.get("thread-t")!.forgotten = true;
      fake.streams.failShells();
      await watcher.until((w) => w.count("reconnected") === 1, 4_000);
      await pause(300);
      expect(afterStart(watcher.kinds)).toEqual(expected);
      expect(fake.streams.threadSubscriptions("thread-t")).toBe(2);
    },
  );
});
