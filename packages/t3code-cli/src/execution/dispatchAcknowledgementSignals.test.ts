// ---
// relationships:
//   verifies: output-contract
// ---
import { afterEach, expect, it, vi } from "vite-plus/test";
import { T3ConnectionError } from "@wyrd-company/t3code-lib";
import { deferred, holdReceipt, signalFixture } from "../../test/dispatchSignalFixture.ts";

afterEach(() => vi.restoreAllMocks());
const paths: readonly [string, "create" | "update", boolean][] = [
  ["root", "create", true],
  ["continuation", "update", true],
  ["start", "create", true],
  ["start", "create", false],
];
for (const signal of ["SIGINT", "SIGTERM"] as const) {
  it.each(paths)(
    `${signal} during %s %s stops after acknowledgement without dispatching a turn (wait %j)`,
    async (path, hold, waiting) => {
      const f = await signalFixture(path, waiting);
      const baseline = process.listenerCount(signal);
      const entered = deferred<void>(),
        release = deferred<void>();
      if (hold === "create") await holdReceipt(f.create, entered, release);
      else await holdReceipt(f.update, entered, release);
      const running = f.run();
      try {
        await entered.promise;
        expect(process.listenerCount(signal)).toBe(baseline + 1);
        process.emit(signal);
        await new Promise((resolve) => setImmediate(resolve));
        expect(f.stdout, "retains in-flight metadata receipt").toEqual([]);
        expect(f.start, "no turn before metadata acknowledgement").not.toHaveBeenCalled();
        release.resolve();
        expect(await running).toBe(4);
        expect(f.start, "post-acknowledgement stop sends no prompt").not.toHaveBeenCalled();
        expect(
          f.interrupt,
          "metadata acknowledgement links no run to interrupt",
        ).not.toHaveBeenCalled();
        expect(f[hold], "metadata mutation is never retried").toHaveBeenCalledOnce();
        const value = JSON.parse(f.stdout.join(""));
        expect(waiting ? value : value.data, "recovery retains thread with null run").toMatchObject(
          { threadId: "sample-thread", runId: null },
        );
        expect(value.exitCode).toBe(4);
        expect(f.stderr.join("")).toContain("Thread: sample-thread\n");
        expect(f.stderr.join("")).not.toContain("Run:");
        expect(process.listenerCount(signal), "metadata stop closes scope").toBe(baseline);
      } finally {
        release.resolve();
        await running;
        await f.client.close();
      }
    },
  );
  it.each(["create", "update"] as const)(
    `${signal} with failed %s retains failure and known thread`,
    async (hold) => {
      const f = await signalFixture(hold === "create" ? "root" : "continuation");
      const entered = deferred<void>(),
        release = deferred<void>();
      const fail = async () => {
        entered.resolve();
        await release.promise;
        throw new T3ConnectionError("closed", "sample receipt failure");
      };
      f[hold].mockImplementation(fail);
      const running = f.run();
      try {
        await entered.promise;
        process.emit(signal);
        release.resolve();
        expect(await running).toBe(4);
        expect(JSON.parse(f.stdout.join(""))).toMatchObject({
          threadId: expect.any(String),
          runId: null,
          exitCode: 4,
          error: { code: "connection" },
        });
        expect(f.stderr.join("")).toContain("Thread: ");
        expect(f.start).not.toHaveBeenCalled();
        expect(f.interrupt).not.toHaveBeenCalled();
        expect(f[hold]).toHaveBeenCalledOnce();
      } finally {
        release.resolve();
        await running;
        await f.client.close();
      }
    },
  );
}
