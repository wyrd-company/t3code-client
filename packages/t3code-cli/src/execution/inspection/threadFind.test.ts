// ---
// relationships:
//   verifies: command-line
// ---
import * as NodeFSP from "node:fs/promises";
import { afterEach, expect, it, vi } from "vite-plus/test";
import {
  T3Client,
  T3ConnectionError,
  T3PreconditionError,
  threadId,
} from "@wyrd-company/t3code-lib";
import { main } from "../../main.ts";
import type { CommandSurface } from "../../registration.ts";
import { executionHandlers } from "../index.ts";

const surface = JSON.parse(
  await NodeFSP.readFile(
    new URL("../../../../../docs/specifications/cli-surface.json", import.meta.url),
    "utf8",
  ),
) as CommandSurface;
const client = T3Client.create({ baseUrl: "http://127.0.0.1:1" });
afterEach(() => vi.restoreAllMocks());
async function run(options: string[], json = true) {
  vi.spyOn(T3Client, "create").mockReturnValue(client);
  vi.spyOn(client, "close").mockResolvedValue();
  const stdout: string[] = [],
    stderr: string[] = [];
  const code = await main(
    ["thread", "find", ...options, "--server", "http://127.0.0.1:1", ...(json ? ["--json"] : [])],
    surface,
    {
      stdout: (text) => {
        stdout.push(text);
      },
      stderr: (text) => {
        stderr.push(text);
      },
    },
    executionHandlers,
  );
  return {
    code,
    stdout: stdout.join(""),
    stderr: stderr.join(""),
    result: json ? JSON.parse(stdout.join("")) : null,
  };
}
const flags = ["--provider", "sample-provider", "--session", "native-session-1"];

it.each([threadId("thread-1"), null])("prints the resolved id or null: %s", async (id) => {
  const find = vi.spyOn(client.threads, "findByNativeSession").mockResolvedValue(id);
  expect((await run(flags)).result).toEqual({ data: id, exitCode: 0 });
  expect(find).toHaveBeenCalledWith("sample-provider", "native-session-1");
  const text = await run(flags, false);
  expect(text.code).toBe(0);
  expect(text.stdout).toBe(`${id ?? "null"}\n`);
  expect(text.stderr).toBe("");
});

it.each([
  [],
  ["--provider", "sample-provider"],
  ["--session", "native-session-1"],
  ["--provider", " ", "--session", "native-session-1"],
  ["--provider", "bad provider", "--session", "native-session-1"],
  ["--provider", "sample-provider", "--session", " "],
])("rejects missing or invalid inputs before client creation: %j", async (...options) => {
  expect((await run(options)).code).toBe(2);
  expect(T3Client.create).not.toHaveBeenCalled();
});

it("preserves connection failures and ambiguous matches as errors", async () => {
  const find = vi.spyOn(client.threads, "findByNativeSession");
  for (const [error, exitCode] of [
    [new T3ConnectionError("open_failed", "sample failure"), 8],
    [new T3PreconditionError("The native session matches more than one T3 Code thread."), 2],
  ] as const) {
    find.mockRejectedValue(error);
    const result = await run(flags);
    expect(result.code).toBe(exitCode);
    expect(result.result.error).toBeDefined();
  }
});
