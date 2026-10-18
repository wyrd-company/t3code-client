// ---
// relationships:
//   verifies: mcp
// ---
import { afterEach, expect, it, vi } from "vite-plus/test";
import { harness, projection } from "../../test/support/fakes.ts";
import { waitForThreads, waitTools } from "./wait.ts";
afterEach(() => vi.useRealTimers());
const input = {
  threads: [{ server: "alpha", threadId: "thread-1" }],
  until: "all" as const,
  timeoutMs: 1000,
};
it("settles any/all across servers and cancels the remaining watches", async () => {
  const h = harness({
    servers: {
      alpha: { url: "https://server.example", tokenEnv: "SAMPLE_TOKEN" },
      beta: { url: "https://other.example", tokenEnv: "SAMPLE_TOKEN" },
    },
  });
  for (const until of ["all", "any"] as const) {
    expect(
      await waitForThreads(
        { ...input, until, threads: [...input.threads, { server: "beta", threadId: "thread-2" }] },
        h.context,
      ),
    ).toMatchObject({
      timedOut: false,
      threads: [{ server: "alpha", settled: true }, { server: "beta" }],
    });
  }
  expect(h.threads.watch.mock.calls.every(([, options]) => options.signal.aborted)).toBe(true);
});
it("times out idle threads without interrupting and reports progress every 15 seconds", async () => {
  vi.useFakeTimers();
  const h = harness({}, projection("idle"));
  const progress = vi.fn(async () => {});
  const pending = waitForThreads({ ...input, timeoutMs: 45_000 }, { ...h.context, progress });
  await vi.advanceTimersByTimeAsync(30_000);
  expect(progress).toHaveBeenCalledTimes(2);
  await vi.advanceTimersByTimeAsync(15_000);
  expect(await pending).toMatchObject({ timedOut: true });
  expect(h.threads.interrupt).not.toHaveBeenCalled();
  expect(vi.getTimerCount()).toBe(0);
});
it("aborts promptly and joins watchers on request cancellation", async () => {
  const h = harness({}, projection("running"));
  const controller = new AbortController();
  const pending = waitForThreads(input, { ...h.context, signal: controller.signal });
  const rejected = expect(pending).rejects.toThrow("cancelled");
  await Promise.resolve();
  controller.abort(new Error("cancelled"));
  await rejected;
  expect(h.threads.watch.mock.calls.every(([, options]) => options.signal.aborted)).toBe(true);
});
it("validates the ten-minute maximum and nonempty references", async () => {
  const h = harness();
  await expect(waitTools[0]!.run({ threads: [] }, h.context)).rejects.toThrow();
  await expect(waitTools[0]!.run({ ...input, timeoutMs: 600_001 }, h.context)).rejects.toThrow();
});
it("distinguishes any from all when only one thread settles", async () => {
  vi.useFakeTimers();
  const h = harness();
  h.threads.watch.mockImplementation(async function* (id, options) {
    yield {
      kind: "snapshot",
      snapshot: {
        snapshotSequence: 1,
        projection: projection(id === "done" ? "completed" : "running"),
      },
    };
    if (options.signal.aborted) return;
    await new Promise<void>((resolve) =>
      options.signal.addEventListener("abort", () => resolve(), { once: true }),
    );
  });
  const threads = [{ threadId: "done" }, { threadId: "busy" }];
  expect(await waitForThreads({ ...input, threads, until: "any" }, h.context)).toMatchObject({
    timedOut: false,
  });
  const all = waitForThreads({ ...input, threads, until: "all" }, h.context);
  await vi.advanceTimersByTimeAsync(1000);
  expect(await all).toMatchObject({ timedOut: true });
});
it("settles a running thread when it has an open request", async () => {
  const state = projection("running", {
    runtimeRequests: [
      {
        id: "request-1",
        nodeId: "node-1",
        providerTurnId: null,
        nativeRequestRef: null,
        kind: "user_input",
        status: "pending",
        responseCapability: { type: "message" },
        createdAt: "2020-01-01T00:00:00.000Z",
        resolvedAt: null,
      },
    ],
  });
  const h = harness({}, state);
  expect(await waitForThreads(input, h.context)).toMatchObject({
    timedOut: false,
    threads: [{ pendingRequests: [{ kind: "user-input", requestId: "request-1" }] }],
  });
});
