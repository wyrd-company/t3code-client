// ---
// relationships:
//   verifies: command-line
// ---
import * as NodeFSP from "node:fs/promises";
import { expect, it, vi } from "vite-plus/test";
import { T3Client, T3TimeoutError } from "@wyrd-company/t3code-lib";
import { main } from "./main.ts";
import { createInvocation } from "./context.ts";
import { Output } from "./output.ts";
import type { CommandSurface } from "./registration.ts";
const surface = JSON.parse(
  await NodeFSP.readFile(
    new URL("../../../specifications/assets/cli-surface.json", import.meta.url),
    "utf8",
  ),
) as CommandSurface;
function capture() {
  const stdout: string[] = [],
    stderr: string[] = [];
  return {
    stdout,
    stderr,
    sink: {
      stdout: (s: string) => {
        stdout.push(s);
      },
      stderr: (s: string) => {
        stderr.push(s);
      },
    },
  };
}

it.each([
  ["run-detach", 5],
  ["run-interrupt", 6],
] as const)("preserves %s after first and cached connection access", async (context, code) => {
  for (const cached of [false, true]) {
    const captureOutput = capture();
    const exit = await main(
      ["run", "sample", "--json", "--server", "http://127.0.0.1:1"],
      surface,
      captureOutput.sink,
      {
        run: async (_args, _command, invocation) => {
          if (cached) await invocation.client();
          invocation.errorContext = context;
          await invocation.resolve();
          await invocation.client();
          throw new T3TimeoutError("sample deadline");
        },
      },
    );
    expect(exit).toBe(code);
    expect(JSON.parse(captureOutput.stdout.join("")).exitCode).toBe(code);
  }
});
it.each([false, true])(
  "selects start execution envelope on parse failure when wait=%s",
  async (wait) => {
    const c = capture();
    const exit = await main(
      ["thread", "start", "sample", ...(wait ? ["--wait"] : []), "--json", "--bogus"],
      surface,
      c.sink,
    );
    expect(exit).toBe(2);
    const result = JSON.parse(c.stdout.join(""));
    if (wait) {
      expect(result).toMatchObject({
        threadId: null,
        runId: null,
        state: "unknown",
        assistantMessage: null,
        pendingRequests: [],
        exitCode: 2,
        durationMs: expect.any(Number),
        error: expect.any(Object),
      });
      expect(result).not.toHaveProperty("data");
    } else {
      expect(result).toEqual({ data: null, exitCode: 2, error: expect.any(Object) });
      expect(result).not.toHaveProperty("threadId");
    }
  },
);
it.each([false, true])(
  "selects start execution envelope on handler failure when wait=%s",
  async (wait) => {
    const c = capture();
    const exit = await main(
      ["thread", "start", "sample", ...(wait ? ["--wait"] : []), "--json"],
      surface,
      c.sink,
      {
        "thread start": async () => {
          throw new Error("sample failure");
        },
      },
    );
    expect(exit).toBe(1);
    const result = JSON.parse(c.stdout.join(""));
    if (wait) {
      expect(result).toMatchObject({
        threadId: null,
        runId: null,
        state: "unknown",
        assistantMessage: null,
        pendingRequests: [],
        exitCode: 1,
        durationMs: expect.any(Number),
        error: expect.any(Object),
      });
      expect(result).not.toHaveProperty("data");
    } else {
      expect(result).toEqual({ data: null, exitCode: 1, error: expect.any(Object) });
      expect(result).not.toHaveProperty("threadId");
    }
  },
);
it.each([
  ["silent", []],
  ["debug", ["debug", "info", "warn", "error"]],
  [undefined, ["warn", "error"]],
] as const)("gates transport diagnostics at log level %s", async (level, expected) => {
  const c = capture();
  const spy = vi.spyOn(T3Client, "create");
  const invocation = createInvocation(
    { server: "http://127.0.0.1:1", ...(level === undefined ? {} : { logLevel: level }) },
    new Output(c.sink),
  );
  try {
    await invocation.client();
    const logger = spy.mock.lastCall![0].logger!;
    logger.debug("sample");
    logger.info("sample");
    logger.warn("sample");
    logger.error("sample");
    expect(c.stdout).toEqual([]);
    expect(c.stderr).toEqual(expected.map((level) => `t3c: ${level}: transport diagnostic\n`));
  } finally {
    await invocation.close();
    spy.mockRestore();
  }
});
it.each([[], ["thread"], ["auth"], ["project"], ["server"]].map((args) => ({ args })))(
  "shows bare command help on stderr for %j with final error last",
  async ({ args }) => {
    const c = capture();
    expect(await main(args, surface, c.sink)).toBe(2);
    expect(c.stdout).toEqual([]);
    expect(c.stderr.join("")).toContain(`Usage: t3c${args.length ? ` ${args[0]}` : ""}`);
    expect(c.stderr.join("")).toContain("Commands:");
    expect(c.stderr.join("")).toMatch(/t3c: Invalid command or option\. Use --help\.\n$/);
    const json = capture();
    expect(await main([...args, "--json"], surface, json.sink)).toBe(2);
    expect(JSON.parse(json.stdout.join(""))).toEqual({
      data: null,
      exitCode: 2,
      error: expect.any(Object),
    });
    expect(json.stdout.join("").trim().split("\n")).toHaveLength(1);
    expect(json.stderr.join("")).toBe("t3c: Invalid command or option. Use --help.\n");
  },
);

it("uses local context for a failed first resolution even inside a run deadline", async () => {
  const { ProfileManager, T3ConnectionError } = await import("@wyrd-company/t3code-lib");
  const { exitCodeFor } = await import("./errors.ts");
  const profiles = new ProfileManager();
  vi.spyOn(profiles, "resolve").mockRejectedValue(
    new T3ConnectionError("open_failed", "sample storage failure"),
  );
  const invocation = createInvocation({}, new Output(capture().sink), profiles);
  invocation.errorContext = "run-detach";
  try {
    await invocation.resolve();
    throw new Error("Expected failure");
  } catch (error) {
    expect(exitCodeFor(error, invocation.errorContext)).toBe(1);
  }
});
