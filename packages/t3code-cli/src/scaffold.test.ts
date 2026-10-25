// ---
// relationships:
//   verifies: command-line
// ---
import * as NodeFSP from "node:fs/promises";
import * as NodeOS from "node:os";
import * as NodePath from "node:path";
import { expect, it, vi, afterEach } from "vite-plus/test";
import {
  ProfileManager,
  T3ConnectionError,
  T3StorageError,
  T3PreconditionError,
  T3TimeoutError,
  T3InterruptedError,
  T3AuthError,
  T3NotFoundError,
  T3RpcError,
} from "@wyrd-company/t3code-lib";
import { main } from "./main.ts";
import { createInvocation } from "./context.ts";
import { exitCodeFor, exitCodeForState } from "./errors.ts";
import { durationMs, checkNode } from "./options.ts";
import { Output, emptyExecution } from "./output.ts";
import { registerCommands, type CommandSurface } from "./registration.ts";
import { versionVerdict } from "./version.ts";

const surface = JSON.parse(
  await NodeFSP.readFile(
    new URL("../../../docs/specifications/cli-surface.json", import.meta.url),
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
afterEach(() => vi.unstubAllEnvs());

it("registers every canonical command, positional input and option", () => {
  const root = registerCommands(surface, {}, "1.2.3");
  function inspect(entries: CommandSurface["commands"], parent: typeof root) {
    expect(parent.commands.map((c) => c.name())).toEqual(entries.map((c) => c.name));
    for (const entry of entries) {
      const command = parent.commands.find((c) => c.name() === entry.name)!;
      expect(
        command.registeredArguments.map((a) => ({ name: a.name(), required: a.required })),
      ).toEqual(
        (entry["positional-arguments"] ?? []).map((a) => ({
          name: a.name,
          required: a.required ?? false,
        })),
      );
      expect(command.options.filter((o) => o.long !== "--help").map((o) => o.long)).toEqual(
        (entry.options ?? []).map((o) => o.flags[0]),
      );
      if (entry.subcommands) inspect(entry.subcommands, command);
    }
  }
  inspect(surface.commands, root);
  expect(root.options.map((o) => o.long).sort()).toEqual(
    surface["global-options"].map((o) => o.flags[0]).sort(),
  );
});
it("parses positive durations with bare seconds and checks the Node minimum", () => {
  for (const [value, result] of [
    ["2", 2000],
    ["2ms", 2],
    ["1.5s", 1500],
    ["2m", 120000],
    ["1h", 3600000],
  ] as const)
    expect(durationMs(value)).toBe(result);
  for (const value of ["0", "-1", "NaN", "1d", " ", "Infinity"])
    expect(() => durationMs(value)).toThrow();
  for (const value of ["20.19.0", "22.15.9"])
    expect(() => checkNode(value)).toThrow("Node >=22.16");
  for (const value of ["22.16.0", "24.0.0"]) expect(() => checkNode(value)).not.toThrow();
});
it("maps stable errors by operation context and all terminal states", () => {
  expect(exitCodeFor(new T3ConnectionError("open_failed", "sample"), "local")).toBe(8);
  expect(exitCodeFor(new T3StorageError("sample"), "connection")).toBe(1);
  expect(exitCodeFor(new T3ConnectionError("open_failed", "sample"), "connection")).toBe(8);
  expect(exitCodeFor(new T3PreconditionError("sample"))).toBe(2);
  expect(exitCodeFor(T3AuthError.insufficientScope("orchestration:read", "sample"))).toBe(9);
  expect(
    exitCodeFor(
      new T3NotFoundError("sample", { status: 404, method: "GET", path: "/", body: null }),
    ),
  ).toBe(10);
  expect(exitCodeFor(new T3InterruptedError("sample"))).toBe(4);
  expect(exitCodeFor(new T3TimeoutError("sample"), "connection")).toBe(8);
  expect(exitCodeFor(new T3TimeoutError("sample"), "run-detach")).toBe(5);
  expect(exitCodeFor(new T3TimeoutError("sample"), "run-interrupt")).toBe(6);
  expect(
    exitCodeFor(
      new T3RpcError("sample", {
        _tag: "EnvironmentAuthorizationError",
        message: "sample",
        requiredScope: "orchestration:read",
      }),
    ),
  ).toBe(9);
  expect(
    exitCodeFor(
      new T3RpcError("sample", { _tag: "UnknownFailure", message: "sample" }),
      "dispatch",
    ),
  ).toBe(1);
  expect(
    ["completed", "idle", "failed", "rolled_back", "interrupted", "cancelled", "unknown"].map(
      exitCodeForState,
    ),
  ).toEqual([0, 0, 3, 3, 4, 4, 1]);
});
it("distinguishes exact profile lookup from switch and logout preconditions", async () => {
  const dir = await NodeFSP.mkdtemp(NodePath.join(NodeOS.tmpdir(), "t3c-mapping-"));
  try {
    const profiles = new ProfileManager({ configDir: dir });
    for (const [call, code] of [
      [() => profiles.resolveProfile("absent"), 10],
      [() => profiles.switch("absent"), 2],
      [() => profiles.logout("absent"), 2],
    ] as const) {
      try {
        await call();
        throw new Error("Expected rejection");
      } catch (error) {
        expect(exitCodeFor(error, "local")).toBe(code);
      }
    }
  } finally {
    await NodeFSP.rm(dir, { recursive: true, force: true });
  }
});
it("emits one execution JSON object, preserves ids and keeps the short error last", () => {
  const c = capture(),
    out = new Output(c.sink, true);
  out.progress("thread: sample");
  const result = {
    ...emptyExecution(12),
    threadId: "sample",
    runId: "sample-run",
    exitCode: 7 as const,
    pendingRequests: [{ id: "question" }],
    error: { code: "pending", message: "Input required." },
  };
  out.finish(result);
  expect(JSON.parse(c.stdout.join(""))).toEqual(result);
  expect(c.stdout.join("").trim().split("\n")).toHaveLength(1);
  expect(c.stderr.join("")).toBe("thread: sample\nt3c: Input required.\n");
  expect(() => out.finish(result)).toThrow("already finished");
});
it("streams text without duplicating the final answer and JSON as events plus result", () => {
  for (const json of [false, true]) {
    const c = capture(),
      out = new Output(c.sink, json, true);
    out.delta("SAMPLE");
    out.finish({ ...emptyExecution(2), assistantMessage: "SAMPLE" });
    if (json)
      expect(
        c.stdout
          .join("")
          .trim()
          .split("\n")
          .map((s) => JSON.parse(s).type),
      ).toEqual(["assistantDelta", "result"]);
    else expect(c.stdout.join("")).toBe("SAMPLE\n");
  }
});
it("prints metadata version only, help, usage and explicit placeholder failures", async () => {
  const version = JSON.parse(
    await NodeFSP.readFile(new URL("../package.json", import.meta.url), "utf8"),
  ).version;
  const c = capture();
  expect(await main(["--version"], surface, c.sink)).toBe(0);
  expect(c.stdout.join("")).toBe(`t3c ${version}\n`);
  expect(c.stderr).toEqual([]);
  const help = capture();
  expect(await main(["thread", "--help"], surface, help.sink)).toBe(0);
  expect(help.stdout.join("")).toContain("respond");
  for (const argv of [
    ["absent", "--json"],
    ["run", "--json", "--connect-timeout", "0"],
    ["run", "--json", "--log-level", "absent"],
  ]) {
    const c = capture();
    expect(await main(argv, surface, c.sink)).toBe(2);
    expect(JSON.parse(c.stdout.join("")).exitCode).toBe(2);
  }
  const pending = capture();
  expect(await main(["run", "sample", "--json"], surface, pending.sink)).toBe(1);
  expect(JSON.parse(pending.stdout.join("")).threadId).toBeNull();
});
it.each(["", " \t "])(
  "uses inherited blank environment fallbacks and reports effective version sources %j",
  async (blank) => {
    const dir = await NodeFSP.mkdtemp(NodePath.join(NodeOS.tmpdir(), "t3c-compose-"));
    try {
      vi.stubEnv("T3C_CONFIG_HOME", blank);
      vi.stubEnv("XDG_CONFIG_HOME", dir);
      vi.stubEnv("T3_SERVER_URL", blank);
      vi.stubEnv("T3_TOKEN", blank);
      await NodeFSP.mkdir(NodePath.join(dir, "t3c"));
      await NodeFSP.writeFile(
        NodePath.join(dir, "t3c/config.json"),
        JSON.stringify({ servers: { sample: { url: "http://127.0.0.1:1" } }, current: "sample" }),
      );
      const c = capture();
      expect(await main(["version", "--json"], surface, c.sink)).toBe(0);
      expect(JSON.parse(c.stdout.join("")).data.sources).toEqual({
        server: "profile",
        credentials: "profile",
      });
      vi.stubEnv("T3_SERVER_URL", "http://127.0.0.1:2");
      vi.stubEnv("T3_TOKEN", "sample-token");
      const invocation = createInvocation(
        { server: "http://127.0.0.1:3", credentials: NodePath.join(dir, "missing") },
        new Output(c.sink),
      );
      expect((await invocation.resolve()).sources).toEqual({ server: "flag", credentials: "file" });
      const environment = createInvocation({}, new Output(c.sink));
      expect((await environment.resolve()).sources).toEqual({
        server: "environment",
        credentials: "environment",
      });
      vi.stubEnv("XDG_CONFIG_HOME", blank);
      expect(new ProfileManager().configDir).toBe(NodePath.join(NodeOS.homedir(), ".config/t3c"));
    } finally {
      await NodeFSP.rm(dir, { recursive: true, force: true });
    }
  },
);
it("keeps credential-file I/O local at the client boundary and version verdict informational", async () => {
  const c = capture();
  const invocation = createInvocation(
    { server: "http://127.0.0.1:1", credentials: "/dev/null/sample" },
    new Output(c.sink),
  );
  try {
    const client = await invocation.client();
    await client.auth.sessionState();
    throw new Error("Expected failure");
  } catch (error) {
    expect(exitCodeFor(error, invocation.errorContext)).toBe(1);
  } finally {
    await invocation.close();
  }
  expect(["0.1.2", "0.2.0", "0.0.1", "0.1.2-nightly.1", "custom"].map(versionVerdict)).toEqual([
    "match",
    "newer",
    "older",
    "older",
    null,
  ]);
});
