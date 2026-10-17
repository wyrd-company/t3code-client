// ---
// relationships:
//   verifies: command-line
// ---
import * as NodeFSP from "node:fs/promises";
import { expect, it, vi } from "vite-plus/test";
import {
  T3AuthError,
  T3ConnectionError,
  T3NotFoundError,
  T3PreconditionError,
} from "@wyrd-company/t3code-lib";
import { main } from "./main.ts";
import { Output, emptyExecution } from "./output.ts";
import type { CommandSurface } from "./registration.ts";
const surface = JSON.parse(
  await NodeFSP.readFile(
    new URL("../../../docs/specifications/cli-surface.json", import.meta.url),
    "utf8",
  ),
) as CommandSurface;

it.each([
  [new T3PreconditionError("sample"), 2, "local"],
  [new T3ConnectionError("open_failed", "sample"), 8, "connection"],
  [T3AuthError.insufficientScope("orchestration:read", "sample"), 9, "connection"],
  [
    new T3NotFoundError("sample", { status: 404, method: "GET", path: "/", body: null }),
    10,
    "connection",
  ],
] as const)(
  "emits null identities for a handler pre-dispatch failure %s",
  async (error, code, context) => {
    const stdout: string[] = [],
      stderr: string[] = [];
    const exit = await main(
      ["run", "sample", "--json"],
      surface,
      {
        stdout: (s) => {
          stdout.push(s);
        },
        stderr: (s) => {
          stderr.push(s);
        },
      },
      {
        run: async (_args, _command, invocation) => {
          invocation.errorContext = context;
          throw error;
        },
      },
    );
    expect(exit).toBe(code);
    expect(JSON.parse(stdout.join(""))).toMatchObject({
      threadId: null,
      runId: null,
      exitCode: code,
    });
    expect(stderr.join("")).not.toContain("sample");
  },
);
it("keeps assistant text on stdout, diagnostics on stderr, and closes output after failure", () => {
  const stdout: string[] = [],
    stderr: string[] = [];
  const output = new Output({
    stdout: (s) => {
      stdout.push(s);
    },
    stderr: (s) => {
      stderr.push(s);
    },
  });
  output.progress("thread: sample");
  output.delta("IGNORED");
  output.finish({
    ...emptyExecution(0),
    assistantMessage: "SAMPLE",
    exitCode: 7,
    error: { code: "pending", message: "Input required." },
  });
  output.progress("late diagnostic");
  expect(stdout.join("")).toBe("SAMPLE\n");
  expect(stderr.join("")).toBe("thread: sample\nt3c: Input required.\n");
});
it("returns a handler result code, shares global options and closes its lazy client", async () => {
  const close = vi.fn().mockResolvedValue(undefined);
  // The injection seam composes real command handlers without replacing registration.
  let captured: unknown;
  const output: string[] = [];
  const exit = await main(
    ["thread", "wait", "sample", "--json", "--connect-timeout", "2s"],
    surface,
    {
      stdout: (s) => {
        output.push(s);
      },
      stderr: () => {},
    },
    {
      "thread wait": async (args, command, invocation) => {
        captured = { args, timeout: command.optsWithGlobals()["connectTimeout"] };
        invocation.close = close;
        invocation.output.finish({
          ...emptyExecution(4),
          threadId: "sample",
          state: "running",
          exitCode: 5,
        });
      },
    },
  );
  expect(captured).toEqual({ args: ["sample"], timeout: "2s" });
  expect(exit).toBe(5);
  expect(close).toHaveBeenCalledOnce();
  expect(JSON.parse(output.join("")).threadId).toBe("sample");
});
it("ships a registry shrinkwrap matching actual CLI and library versions", async () => {
  const read = async (path: string) =>
    JSON.parse(await NodeFSP.readFile(new URL(path, import.meta.url), "utf8"));
  const lock = await read("../npm-shrinkwrap.json"),
    cli = await read("../package.json"),
    lib = await read("../../t3code-lib/package.json");
  expect(lock.name).toBe(cli.name);
  expect(lock.version).toBe(cli.version);
  expect(lock.packages[""].dependencies[lib.name]).toBe(lib.version);
  for (const [path, entry] of Object.entries(lock.packages) as [
    string,
    { resolved?: string; integrity?: string; link?: boolean },
  ][]) {
    if (!path) continue;
    expect(entry.link).not.toBe(true);
    expect(entry.resolved).toMatch(/^https:\/\/registry.npmjs.org\//);
    expect(entry.integrity).toMatch(/^sha512-/);
  }
});
