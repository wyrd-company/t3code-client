// ---
// relationships:
//   verifies: command-line
// ---
import * as NodeFSP from "node:fs/promises";
import { afterEach, expect, it, vi } from "vite-plus/test";
import {
  T3Client,
  T3AuthError,
  T3ConnectionError,
  T3InterruptedError,
  T3RpcError,
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
const controls = [
  {
    args: ["stop", " thread-1 "],
    method: "stopThread",
    call: ["thread-1", {}],
    data: { threadId: "thread-1" },
    text: "Stop requested: thread-1\n",
  },
  {
    args: ["queue", "resume", " thread-1 "],
    method: "resumeQueue",
    call: ["thread-1"],
    data: { threadId: "thread-1" },
    text: "Queue resume requested: thread-1\n",
  },
  {
    args: ["queue", "start", " thread-1 ", " run-1 "],
    method: "startQueuedRun",
    call: ["thread-1", "run-1"],
    data: { threadId: "thread-1", runId: "run-1" },
    text: "Queued run start requested: thread-1\trun-1\n",
  },
] as const;
it.each(controls)(
  "acknowledges $method with normalized ids and text/JSON output",
  async ({ args, method, call, data, text }) => {
    const spy = vi.spyOn(client.threads, method).mockResolvedValue();
    expect((await run([...args])).result).toEqual({ data, exitCode: 0 });
    expect(spy).toHaveBeenLastCalledWith(...call);
    expect((await run([...args], false)).stdout).toBe(text);
  },
);
it.each(["", " padded "])("preserves Stop reason %j", async (reason) => {
  const stop = vi.spyOn(client.threads, "stopThread").mockResolvedValue();
  expect((await run(["stop", "thread-1", "--reason", reason])).code).toBe(0);
  expect(stop).toHaveBeenCalledWith("thread-1", { reason });
});
it.each([
  ["stop", " "],
  ["stop"],
  ["queue", "resume", " "],
  ["queue", "resume"],
  ["queue", "start", " ", "run-1"],
  ["queue", "start", "thread-1", " "],
  ["queue", "start", "thread-1"],
])("rejects invalid ids before client creation: %j", async (...args) => {
  expect((await run(args)).code).toBe(2);
  expect(T3Client.create).not.toHaveBeenCalled();
});
it.each(controls)(
  "maps $method failures without a successful receipt",
  async ({ args, method }) => {
    const spy = vi.spyOn(client.threads, method);
    for (const [error, code] of [
      [new T3ConnectionError("closed", "sample-private"), 8],
      [T3AuthError.insufficientScope("orchestration:operate", "sample-private"), 9],
      [new T3InterruptedError("Sample cancellation."), 4],
      [
        new T3RpcError("orchestration.dispatchCommand", {
          _tag: "OrchestrationV2DispatchCommandError",
          commandId: "command-1",
          commandType: "queued-run.start",
          message: "sample-private",
        }),
        1,
      ],
    ] as const) {
      spy.mockRejectedValue(error);
      const result = await run([...args]);
      expect(result.code).toBe(code);
      expect(result.result.error).toBeDefined();
      expect(result.result.data).toBeNull();
      expect(result.stdout + result.stderr).not.toContain("sample-private");
    }
  },
);
