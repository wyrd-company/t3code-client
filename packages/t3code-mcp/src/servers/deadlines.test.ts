// ---
// relationships:
//   verifies: mcp
// ---
import * as NodeTimers from "node:timers/promises";
import { afterEach, expect, it, vi } from "vite-plus/test";
import { T3Client, T3PreconditionError, type StoredCredentials } from "@wyrd-company/t3code-lib";
import { config, fakeClient, projection } from "../../test/support/fakes.ts";
import { discoveryTools } from "../tools/discovery.ts";
import { waitForThreads } from "../tools/wait.ts";
import { SERVER_DEADLINE_MS } from "./acquisition.ts";
import { ServerRegistry } from "./registry.ts";

afterEach(() => vi.useRealTimers());

function heldCredential() {
  let release!: () => void;
  let reject!: () => void;
  const held = new Promise<StoredCredentials>((resolve, fail) => {
    release = () => resolve({ accessToken: "sample-credential" });
    reject = () => fail(new T3PreconditionError("Late credential failure."));
  });
  const load = vi.fn(async () => held).mockResolvedValueOnce({ accessToken: "sample-credential" });
  const fetch = vi.fn<typeof globalThis.fetch>(async () => {
    throw new T3PreconditionError("Late HTTP failure.");
  });
  const healthy = fakeClient();
  const registry = new ServerRegistry(
    config({
      servers: {
        alpha: {
          url: "https://other.example",
          tokenEnv: "SAMPLE_TOKEN",
        },
        beta: {},
      },
    }),
    {
      env: { SAMPLE_TOKEN: "sample-credential" },
      profiles: {
        resolveProfile: async () => ({
          baseUrl: "https://server.example",
          credentials: { load, save: vi.fn(), clear: vi.fn() },
          sources: { server: "profile", credentials: "profile" },
        }),
      },
      create: (options) =>
        options.baseUrl.includes("other") ? healthy.client : T3Client.create({ ...options, fetch }),
    },
  );
  return { registry, load, release, reject, fetch, healthy };
}

it.each(["timeout", "cancellation", "condition"] as const)(
  "finishes a wait on %s without joining a held library credential load",
  async (cause) => {
    vi.useFakeTimers();
    const h = heldCredential();
    const unhandled = vi.fn();
    process.on("unhandledRejection", unhandled);
    const controller = new AbortController();
    let settle!: () => void;
    const ready = new Promise<void>((resolve) => {
      settle = resolve;
    });
    h.healthy.threads.watch.mockImplementation(async function* () {
      await ready;
      yield { kind: "snapshot", snapshot: { snapshotSequence: 1, projection: projection() } };
    });
    // Complete the startup redaction read before holding a real library request.
    await vi.advanceTimersByTimeAsync(0);
    let result: object | undefined;
    let failure: unknown;
    const pending = waitForThreads(
      {
        threads: [
          { server: "beta", threadId: "thread-1" },
          ...(cause === "condition" ? [{ server: "alpha", threadId: "thread-2" }] : []),
        ],
        until: "any",
        timeoutMs: 20,
      },
      { registry: h.registry, signal: controller.signal, progress: async () => {} },
    ).then(
      (value) => {
        result = value;
      },
      (error: unknown) => {
        failure = error;
      },
    );
    try {
      await vi.advanceTimersByTimeAsync(0);
      expect(h.load).toHaveBeenCalledTimes(2);
      expect(h.fetch).not.toHaveBeenCalled();
      if (cause === "cancellation") controller.abort(new Error("cancelled"));
      if (cause === "condition") settle();
      await vi.advanceTimersByTimeAsync(cause === "timeout" ? 20 : 0);
      if (cause === "cancellation") expect(failure).toMatchObject({ message: "cancelled" });
      else expect(result).toMatchObject({ timedOut: cause === "timeout" });
      expect(vi.getTimerCount()).toBe(0);
      // Shutdown must not join the in-flight credential load either.
      let closed = false;
      void h.registry.close().then(() => {
        closed = true;
      });
      await vi.advanceTimersByTimeAsync(0);
      expect(closed).toBe(true);
    } finally {
      h.release();
      settle();
      await vi.advanceTimersByTimeAsync(0);
      await pending;
      await h.registry.close();
      await NodeTimers.setImmediate();
      process.removeListener("unhandledRejection", unhandled);
    }
    expect(h.fetch).toHaveBeenCalledOnce();
    expect(unhandled).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  },
);

it.each(["timeout", "cancellation"] as const)(
  "finishes a probe on %s and observes a late credential rejection",
  async (cause) => {
    vi.useFakeTimers();
    const h = heldCredential();
    const unhandled = vi.fn();
    process.on("unhandledRejection", unhandled);
    const controller = new AbortController();
    await vi.advanceTimersByTimeAsync(0);
    let result: unknown;
    const pending = discoveryTools[0]!
      .run({ probe: true }, { registry: h.registry, signal: controller.signal })
      .then((value) => {
        result = value;
      });
    try {
      await vi.advanceTimersByTimeAsync(0);
      expect(h.load.mock.calls.length).toBeGreaterThan(1);
      if (cause === "cancellation") controller.abort(new Error("cancelled"));
      await vi.advanceTimersByTimeAsync(cause === "timeout" ? SERVER_DEADLINE_MS : 0);
      expect(result).toMatchObject({
        servers: [
          { server: "alpha", reachable: true },
          { server: "beta", reachable: false },
        ],
      });
      expect(vi.getTimerCount()).toBe(0);
      let closed = false;
      void h.registry.close().then(() => {
        closed = true;
      });
      await vi.advanceTimersByTimeAsync(0);
      expect(closed).toBe(true);
    } finally {
      h.reject();
      await vi.advanceTimersByTimeAsync(0);
      await pending;
      await h.registry.close();
      await NodeTimers.setImmediate();
      process.removeListener("unhandledRejection", unhandled);
    }
    expect(unhandled).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  },
);
