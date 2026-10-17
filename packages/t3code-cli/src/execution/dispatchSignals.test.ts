// ---
// relationships:
//   verifies: output-contract
// ---
import { afterEach, expect, it, vi } from "vite-plus/test";
import { T3ConnectionError, type TurnHandle } from "@wyrd-company/t3code-lib";
import { deferred, holdReceipt, signalFixture } from "../../test/dispatchSignalFixture.ts";

afterEach(() => vi.restoreAllMocks());
const paths: readonly [string, "start" | "create" | "launch" | "update", boolean?][] = [
  ["root", "start"],
  ["worktree", "launch"],
  ["continuation", "start"],
  ["send", "start"],
  ["start", "start"],
  ["start", "start", false],
];
for (const signal of ["SIGINT", "SIGTERM"] as const) {
  it.each(paths)(
    `${signal} during %s %s retains receipt, interrupts linked run once and closes scope (wait %j)`,
    async (path, hold, waiting = true) => {
      const f = await signalFixture(path, waiting);
      const baseline = process.listenerCount(signal);
      const entered = deferred<void>(),
        release = deferred<void>();
      const spy = f[hold];
      if (hold === "start") await holdReceipt(f.start, entered, release);
      else if (hold === "create") await holdReceipt(f.create, entered, release);
      else if (hold === "launch") await holdReceipt(f.launch, entered, release);
      else await holdReceipt(f.update, entered, release);
      const running = f.run();
      try {
        await entered.promise;
        expect(process.listenerCount(signal), "one early scope during mutation receipt").toBe(
          baseline + 1,
        );
        process.emit(signal);
        await new Promise((resolve) => setImmediate(resolve));
        expect(f.stdout, "does not abort held mutation").toEqual([]);
        expect(f.interrupt, "interrupt waits for linked receipt").not.toHaveBeenCalled();
        release.resolve();
        expect(await running, "signal determines exit").toBe(4);
        const value = JSON.parse(f.stdout.join(""));
        expect(
          waiting ? value : value.data,
          "recovery envelope includes linked identities",
        ).toMatchObject({ threadId: "sample-thread", runId: "linked-run" });
        expect(f.stderr.join(""), "recovery stderr includes thread and run").toContain(
          "Thread: sample-thread",
        );
        expect(f.stderr.join("")).toContain("Run: linked-run");
        expect(
          f.interrupt,
          "holdQueue interrupt of exact linked run",
        ).toHaveBeenCalledExactlyOnceWith("sample-thread", "linked-run", { holdQueue: true });
        expect(spy, "no mutation retry").toHaveBeenCalledOnce();
        expect(f.start).toHaveBeenCalledTimes(path === "worktree" ? 0 : 1);
        expect(process.listenerCount(signal), "scope closes after interruption").toBe(baseline);
      } finally {
        release.resolve();
        await running;
        await f.client.close();
      }
    },
  );
  it.each([true, false])(
    `${signal} during preflight exits with null ids and zero mutations (wait %j)`,
    async (waiting) => {
      const f = await signalFixture("start", waiting);
      const baseline = process.listenerCount(signal);
      const entered = deferred<void>(),
        release = deferred<void>();
      f.session.mockImplementation(async () => {
        entered.resolve();
        await release.promise;
        return f.sessionResult as Awaited<ReturnType<typeof f.client.auth.sessionState>>;
      });
      const running = f.run();
      try {
        await entered.promise;
        expect(process.listenerCount(signal), "early preflight scope").toBe(baseline + 1);
        process.emit(signal);
        expect(await running).toBe(4);
        const value = JSON.parse(f.stdout.join(""));
        expect(waiting ? value : value.data).toEqual(
          waiting ? expect.objectContaining({ threadId: null, runId: null }) : null,
        );
        release.resolve();
        await new Promise((resolve) => setImmediate(resolve));
        expect(f.create, "no late preflight mutation").not.toHaveBeenCalled();
        expect(f.launch).not.toHaveBeenCalled();
        expect(f.start).not.toHaveBeenCalled();
        expect(process.listenerCount(signal)).toBe(baseline);
      } finally {
        release.resolve();
        await running;
        await f.client.close();
      }
    },
  );
}
it.each(["receipt", "link"])(
  "signal with failing %s preserves thread and failure, exits 4",
  async (phase) => {
    const f = await signalFixture();
    const entered = deferred<void>(),
      receipt = deferred<TurnHandle>();
    if (phase === "receipt")
      f.start.mockImplementation(() => {
        entered.resolve();
        return receipt.promise;
      });
    else {
      f.start.mockResolvedValue({
        events: async function* () {
          entered.resolve();
          await receipt.promise;
          yield { kind: "caught-up" };
        },
        completion: new Promise(() => {}),
      } as unknown as TurnHandle);
    }
    const running = f.run();
    try {
      await entered.promise;
      expect(process.listenerCount("SIGTERM"), "scope covers unlinked handle").toBeGreaterThan(0);
      process.emit("SIGTERM");
      receipt.reject(new T3ConnectionError("closed", "sample receipt failure"));
      expect(await running).toBe(4);
      expect(JSON.parse(f.stdout.join(""))).toMatchObject({
        threadId: "sample-thread",
        runId: null,
        exitCode: 4,
        error: { code: "connection" },
      });
      expect(f.stderr.join("")).toContain("Thread: sample-thread");
      expect(f.start).toHaveBeenCalledOnce();
    } finally {
      receipt.resolve(f.turn);
      await running;
      await f.client.close();
    }
  },
);
it("second signal escapes immediately during held receipt", async () => {
  const f = await signalFixture("start", false);
  const entered = deferred<void>(),
    release = deferred<TurnHandle>();
  f.start.mockImplementation(() => {
    entered.resolve();
    return release.promise;
  });
  const running = f.run();
  const exit = vi.spyOn(process, "exit").mockImplementation(() => {
    throw new Error("immediate escape");
  });
  try {
    await entered.promise;
    expect(process.listenerCount("SIGTERM"), "scope installed before receipt").toBeGreaterThan(0);
    process.emit("SIGTERM");
    expect(() => process.emit("SIGINT")).toThrow("immediate escape");
    expect(exit).toHaveBeenCalledWith(4);
  } finally {
    release.resolve(f.turn);
    await running;
    await f.client.close();
  }
});

it.each(["SIGINT", "SIGTERM"] as const)(
  "%s while the acknowledged handle links waits without a second scope",
  async (signal) => {
    const f = await signalFixture();
    const baseline = process.listenerCount(signal);
    const entered = deferred<void>(),
      link = deferred<void>();
    const settled = deferred<import("@wyrd-company/t3code-lib").TurnOutcome>();
    let linked: TurnHandle["runId"];
    f.start.mockResolvedValue({
      get runId() {
        return linked;
      },
      completion: settled.promise,
      async *events() {
        entered.resolve();
        await link.promise;
        linked = f.turn.runId;
        yield { kind: "caught-up" };
        await settled.promise;
      },
    } as unknown as TurnHandle);
    f.interrupt.mockImplementation(async () => {
      settled.resolve({
        threadId: "sample-thread",
        runId: "linked-run",
        state: "interrupted",
        assistantMessage: null,
      } as unknown as import("@wyrd-company/t3code-lib").TurnOutcome);
    });
    const running = f.run();
    try {
      await entered.promise;
      expect(process.listenerCount(signal), "exactly one scope during following").toBe(
        baseline + 1,
      );
      process.emit(signal);
      await new Promise((resolve) => setImmediate(resolve));
      expect(f.interrupt, "does not interrupt an unlinked active run").not.toHaveBeenCalled();
      expect(f.stdout, "waits for link without aborting handle").toEqual([]);
      link.resolve();
      expect(await running).toBe(4);
      expect(f.interrupt).toHaveBeenCalledExactlyOnceWith("sample-thread", "linked-run", {
        holdQueue: true,
      });
      expect(JSON.parse(f.stdout.join(""))).toMatchObject({
        threadId: "sample-thread",
        runId: "linked-run",
        exitCode: 4,
      });
      expect(f.stderr.join("")).toContain("Run: linked-run");
      expect(process.listenerCount(signal), "shared scope closes after follow").toBe(baseline);
    } finally {
      link.resolve();
      settled.resolve({ state: "interrupted" } as import("@wyrd-company/t3code-lib").TurnOutcome);
      await running;
      await f.client.close();
    }
  },
);

it("successful nonwaiting start closes the early scope", async () => {
  const f = await signalFixture("start", false);
  const before = [process.listenerCount("SIGINT"), process.listenerCount("SIGTERM")];
  try {
    expect(await f.run()).toBe(0);
    expect(
      [process.listenerCount("SIGINT"), process.listenerCount("SIGTERM")],
      "normal success closes both listeners",
    ).toEqual(before);
    expect(f.interrupt).not.toHaveBeenCalled();
  } finally {
    await f.client.close();
  }
});
