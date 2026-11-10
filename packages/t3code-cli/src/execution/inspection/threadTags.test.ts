// ---
// relationships:
//   verifies: command-line
// ---
import * as NodeFSP from "node:fs/promises";
import { afterEach, expect, it, vi } from "vite-plus/test";
import { T3Client } from "@wyrd-company/t3code-lib";
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
async function run(args: string[], json = true) {
  vi.spyOn(T3Client, "create").mockReturnValue(client);
  vi.spyOn(client, "close").mockResolvedValue();
  let stdout = "",
    stderr = "";
  const code = await main(
    ["thread", ...args, "--server", "http://127.0.0.1:1", ...(json ? ["--json"] : [])],
    surface,
    {
      stdout: (text) => {
        stdout += text;
      },
      stderr: (text) => {
        stderr += text;
      },
    },
    executionHandlers,
  );
  return { code, stdout, stderr, result: json ? JSON.parse(stdout) : undefined };
}
const thread = (id: string) =>
  ({ id, title: `Sample ${id}`, status: "idle" }) as unknown as Awaited<
    ReturnType<typeof client.threads.list>
  >[number];

it("tags a thread and prints the tags after the change", async () => {
  const spy = vi.spyOn(client.threads, "setTag").mockResolvedValue(["alpha", "beta"]);
  expect((await run(["tag", " thread-1 ", " beta "])).result).toEqual({
    data: { threadId: "thread-1", tags: ["alpha", "beta"] },
    exitCode: 0,
  });
  expect(spy).toHaveBeenLastCalledWith("thread-1", "beta", true);
  expect((await run(["tag", "thread-1", "beta"], false)).stdout).toBe("alpha\nbeta\n");
  spy.mockResolvedValue(["alpha"]);
  expect((await run(["tag", "thread-1", "beta", "--remove"])).result.data.tags).toEqual(["alpha"]);
  expect(spy).toHaveBeenLastCalledWith("thread-1", "beta", false);
});

it.each([
  ["thread-1", " "],
  ["thread-1", "a".repeat(65)],
  ["thread-1", "two\nlines"],
  [" ", "alpha"],
])("refuses thread %j tag %j before connecting", async (id, tag) => {
  const spy = vi.spyOn(client.threads, "setTag");
  const { code, result } = await run(["tag", id, tag]);
  expect(code).toBe(2);
  expect(result.error.code).toBe("precondition");
  expect(spy).not.toHaveBeenCalled();
});

it("filters thread list by tag", async () => {
  const spy = vi.spyOn(client.threads, "list").mockResolvedValue([thread("thread-2")]);
  vi.spyOn(client.threads, "phase").mockReturnValue("idle");
  expect((await run(["list", "--tag", " alpha "], false)).stdout).toBe(
    "thread-2\tidle\tSample thread-2\n",
  );
  expect(spy).toHaveBeenLastCalledWith({ tag: " alpha " });
  await run(["list"]);
  expect(spy).toHaveBeenLastCalledWith({});
});
