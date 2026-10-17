// ---
// relationships:
//   verifies: command-line
// ---
import * as NodeFSP from "node:fs/promises";
import { afterEach, expect, it, vi } from "vite-plus/test";
import {
  memoryCredentialStore,
  ProfileManager,
  T3Client,
  T3TimeoutError,
} from "@wyrd-company/t3code-lib";
import { main } from "./main.ts";
import type { CommandSurface } from "./registration.ts";

const surface = JSON.parse(
  await NodeFSP.readFile(
    new URL("../../../docs/specifications/assets/cli-surface.json", import.meta.url),
    "utf8",
  ),
) as CommandSurface;
const resolved = {
  baseUrl: "http://127.0.0.1:1",
  credentials: memoryCredentialStore(),
  sources: { server: "flag", credentials: "none" },
} as const;
function gate() {
  let release!: () => void;
  const promise = new Promise<void>((resolve) => {
    release = resolve;
  });
  return { promise, release };
}
afterEach(() => vi.restoreAllMocks());

for (const method of ["resolve", "client"] as const)
  for (const [context, expected] of [
    ["run-detach", 5],
    ["run-interrupt", 6],
  ] as const)
    for (const order of ["first-then-second", "second-then-first", "serial"] as const)
      it(`reader preserves ${context} through ${method} ${order}`, async () => {
        const backend = gate();
        const resolve = vi
          .spyOn(ProfileManager.prototype, "resolve")
          .mockImplementation(async () => {
            await backend.promise;
            return resolved;
          });
        const create = vi.spyOn(T3Client, "create");
        const lines: string[] = [],
          errors: string[] = [],
          completed: number[] = [];
        const clients = new Set<T3Client>();
        let sameResult = false;
        try {
          const exit = await main(
            ["run", "sample", "--json"],
            surface,
            {
              stdout: (s) => {
                lines.push(s);
              },
              stderr: (s) => {
                errors.push(s);
              },
            },
            {
              run: async (_args, _command, invocation) => {
                invocation.errorContext = context;
                if (order === "serial") {
                  const first = invocation[method]();
                  backend.release();
                  const one = await first;
                  const two = await invocation[method]();
                  sameResult = one === two;
                  if (one instanceof T3Client) clients.add(one);
                } else {
                  const callers = [gate(), gate()];
                  const ready = [gate(), gate()];
                  async function caller(index: number) {
                    const value = await invocation[method]();
                    if (value instanceof T3Client) clients.add(value);
                    ready[index]!.release();
                    // Hold this caller's continuation independently of the shared backend.
                    await callers[index]!.promise;
                    completed.push(index);
                    return value;
                  }
                  const pending = [caller(0), caller(1)];
                  backend.release();
                  await Promise.all(ready.map((item) => item.promise));
                  for (const index of order === "first-then-second" ? [0, 1] : [1, 0]) {
                    callers[index]!.release();
                    await pending[index];
                  }
                  const values = await Promise.all(pending);
                  sameResult = values[0] === values[1];
                }
                throw new T3TimeoutError("sample deadline");
              },
            },
          );
          expect(exit, "reader deadline exit").toBe(expected);
          expect(lines, "one final result").toHaveLength(1);
          expect(JSON.parse(lines[0]!)).toEqual({
            threadId: null,
            runId: null,
            state: "unknown",
            assistantMessage: null,
            pendingRequests: [],
            exitCode: expected,
            durationMs: expect.any(Number),
            error: {
              code: "timeout",
              message:
                expected === 5
                  ? "Timed out; run remains active."
                  : "Timed out; interruption requested.",
            },
          });
          expect(errors).toEqual([
            expected === 5
              ? "t3c: Timed out; run remains active.\n"
              : "t3c: Timed out; interruption requested.\n",
          ]);
          expect(resolve, "one shared profile initialization").toHaveBeenCalledTimes(1);
          expect(create).toHaveBeenCalledTimes(method === "client" ? 1 : 0);
          expect(sameResult, "shared initialized value").toBe(true);
          if (order !== "serial")
            expect(completed).toEqual(order === "first-then-second" ? [0, 1] : [1, 0]);
        } finally {
          for (const client of clients) await client.close();
        }
      });

for (const method of ["resolve", "client"] as const)
  for (const [context, expected] of [
    ["run-detach", 5],
    ["run-interrupt", 6],
  ] as const)
    it(`reader retains ${context} selected during pending ${method}`, async () => {
      const backend = gate();
      vi.spyOn(ProfileManager.prototype, "resolve").mockImplementation(async () => {
        await backend.promise;
        return resolved;
      });
      const lines: string[] = [];
      const exit = await main(
        ["run", "sample", "--json"],
        surface,
        {
          stdout: (s) => {
            lines.push(s);
          },
          stderr: () => {},
        },
        {
          run: async (_args, _command, invocation) => {
            invocation.errorContext = "dispatch";
            const pending = invocation[method]();
            invocation.errorContext = context;
            backend.release();
            await pending;
            throw new T3TimeoutError("sample deadline");
          },
        },
      );
      expect(exit, "current handler context wins over initialization context").toBe(expected);
      expect(lines).toHaveLength(1);
      expect(JSON.parse(lines[0]!)).toMatchObject({
        threadId: null,
        runId: null,
        state: "unknown",
        exitCode: expected,
        error: {
          code: "timeout",
          message:
            expected === 5
              ? "Timed out; run remains active."
              : "Timed out; interruption requested.",
        },
      });
    });
