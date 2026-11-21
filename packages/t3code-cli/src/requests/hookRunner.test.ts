// ---
// relationships:
//   verifies: request-watch
// ---
import * as NodeChildProcess from "node:child_process";
import { EventEmitter } from "node:events";
import * as NodeFSP from "node:fs/promises";
import * as NodePath from "node:path";
import { PassThrough } from "node:stream";
import { afterEach, expect, it, vi } from "vite-plus/test";
import { HookRunner } from "./hookRunner.ts";

vi.mock("node:child_process", async (original) => {
  const module = await original<typeof NodeChildProcess>();
  return { ...module, spawn: vi.fn(module.spawn) };
});

const serverOrigin = "https://example.test";
const input = { requestId: "request-1", threadId: "thread-1", line: "{}\n" };
const nextInput = { ...input, requestId: "request-2" };
const options = { command: "exit 0", concurrency: 1, timeout: "20ms", timeoutMs: 20 };

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.mocked(NodeChildProcess.spawn).mockReset();
});

it("keeps application child-process imports in the hook runner", async () => {
  const packages = new URL("../../../", import.meta.url);
  const names = await NodeFSP.readdir(packages, { withFileTypes: true });
  const imports = [];
  for (const name of names.filter((entry) => entry.isDirectory())) {
    const src = new URL(`${name.name}/src/`, packages);
    const entries = await NodeFSP.readdir(src, { recursive: true, withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isFile() || !/\.[cm]?[jt]sx?$/.test(entry.name) || entry.name.endsWith(".test.ts"))
        continue;
      const path = NodePath.join(entry.parentPath, entry.name);
      const text = await NodeFSP.readFile(path, "utf8");
      if (/["'`](?:node:)?child_process["'`]/u.test(text)) imports.push(path);
    }
  }
  expect(imports).toEqual([new URL("./hookRunner.ts", import.meta.url).pathname]);
});

it.skipIf(process.platform === "win32")(
  "delivers exact request bytes on stdin and keeps them out of the arguments and environment",
  async () => {
    const command = `"${process.execPath}" --input-type=module -e '
      import { readFileSync } from "node:fs"
      console.log(JSON.stringify({ args: process.argv.slice(1), origin: process.env.T3_SERVER_URL,
        leaked: JSON.stringify(process.env).includes("request-content-marker") }))
      process.stdout.write(readFileSync(0))
      process.stderr.write("final hook line")
    '`;
    const line =
      JSON.stringify({
        prompt: "request-content-marker; $(printf evaluated) `printf evaluated`\n",
      }) + "\n";
    const lines: string[] = [];
    const runner = new HookRunner(
      { ...options, command, timeout: "5s", timeoutMs: 5_000 },
      serverOrigin,
      (message) => lines.push(message),
    );
    runner.enqueue({ ...input, line });
    await runner.drain();
    const prefix = 't3c: hook "request-1": ';
    expect(lines).toContain(
      prefix + JSON.stringify({ args: [], origin: serverOrigin, leaked: false }),
    );
    expect(lines).toContain(prefix + line.trimEnd());
    expect(lines).toContain(prefix + "final hook line");
    expect(runner.counts).toEqual({ succeeded: 1, failed: 0, stopped: 0, notRun: 0 });
    expect(NodeChildProcess.spawn).toHaveBeenCalledExactlyOnceWith(
      command,
      expect.objectContaining({ shell: true, detached: true }),
    );
  },
);

it.skipIf(process.platform === "win32")(
  "continues after a hook exits without reading stdin",
  async () => {
    const messages: string[] = [];
    const runner = new HookRunner(
      { ...options, command: "exit 7", timeout: "5s", timeoutMs: 5_000 },
      serverOrigin,
      (message) => messages.push(message),
    );
    runner.enqueue({ ...input, line: "x".repeat(1_000_000) });
    runner.enqueue(nextInput);
    await runner.drain();
    expect(messages).toEqual([
      't3c: hook failed for request "request-1" in thread "thread-1": exit 7',
      't3c: hook failed for request "request-2" in thread "thread-1": exit 7',
    ]);
    expect(runner.counts.failed).toBe(2);
  },
);

class Shell extends EventEmitter {
  readonly stdin = new PassThrough();
  readonly stdout = new PassThrough();
  readonly stderr = new PassThrough();
  readonly pid: number;
  exitCode: number | null = null;
  signalCode: NodeJS.Signals | null = null;

  constructor(pid: number) {
    super();
    this.pid = pid;
  }

  exit(code: number, close = true): void {
    this.exitCode = code;
    this.emit("exit", code, null);
    if (close) this.emit("close", code, null);
  }
}

it.skipIf(process.platform === "win32").each([false, true])(
  "escalates an ignoring descendant as a group and frees the slot even if it is unreaped: %s",
  async (unreaped) => {
    vi.useFakeTimers();
    const first = new Shell(100);
    const second = new Shell(101);
    const log = vi.fn();
    vi.mocked(NodeChildProcess.spawn)
      .mockReturnValueOnce(first as unknown as NodeChildProcess.ChildProcess)
      .mockReturnValueOnce(second as unknown as NodeChildProcess.ChildProcess);
    let firstGroupExists = true;
    let secondGroupExists = true;
    const kill = vi.spyOn(process, "kill").mockImplementation((pid, signal) => {
      if (pid === -100 && signal === "SIGTERM") first.exit(0, false);
      if (pid === -100 && signal === "SIGKILL") firstGroupExists = unreaped;
      if ((pid === -100 && !firstGroupExists) || (pid === -101 && !secondGroupExists))
        throw Object.assign(new Error("No such process"), { code: "ESRCH" });
      return true;
    });
    const runner = new HookRunner(options, serverOrigin, log);
    try {
      runner.enqueue(input);
      runner.enqueue(nextInput);
      const drain = runner.drain();
      await vi.advanceTimersByTimeAsync(20);
      expect(kill).toHaveBeenCalledWith(-100, "SIGTERM");
      expect(NodeChildProcess.spawn).toHaveBeenCalledTimes(1);
      await vi.advanceTimersByTimeAsync(4_999);
      expect(kill).not.toHaveBeenCalledWith(-100, "SIGKILL");
      expect(NodeChildProcess.spawn).toHaveBeenCalledTimes(1);
      await vi.advanceTimersByTimeAsync(1);
      expect(kill).toHaveBeenCalledWith(-100, "SIGKILL");
      if (unreaped) {
        await vi.advanceTimersByTimeAsync(4_999);
        expect(NodeChildProcess.spawn).toHaveBeenCalledTimes(1);
        await vi.advanceTimersByTimeAsync(1);
      }
      expect(NodeChildProcess.spawn).toHaveBeenCalledTimes(2);
      expect(log).toHaveBeenCalledWith(
        't3c: hook failed for request "request-1" in thread "thread-1": timed out after 20ms',
        "error",
      );
      secondGroupExists = false;
      second.exit(0);
      await drain;
      expect(runner.counts).toEqual({ succeeded: 1, failed: 1, stopped: 0, notRun: 0 });
    } finally {
      runner.forceStop();
    }
  },
);

it.skipIf(process.platform === "win32")(
  "fills exactly the configured number of slots in order",
  async () => {
    const children = [new Shell(100), new Shell(101), new Shell(102)];
    const running = new Set(children.map(({ pid }) => -pid));
    for (const child of children)
      vi.mocked(NodeChildProcess.spawn).mockReturnValueOnce(
        child as unknown as NodeChildProcess.ChildProcess,
      );
    vi.spyOn(process, "kill").mockImplementation((pid) => {
      if (!running.has(pid)) throw Object.assign(new Error("No such process"), { code: "ESRCH" });
      return true;
    });
    const log = vi.fn();
    const runner = new HookRunner({ ...options, concurrency: 2 }, serverOrigin, log);
    try {
      runner.enqueue(input);
      runner.enqueue(nextInput);
      runner.enqueue({ ...input, requestId: "request-3" });
      expect(NodeChildProcess.spawn).toHaveBeenCalledTimes(2);
      const drain = runner.drain();
      for (const [index, child] of children.entries()) {
        running.delete(-child.pid);
        child.exit(0);
        expect(log).toHaveBeenNthCalledWith(
          index + 1,
          `t3c: hook finished for request "request-${index + 1}"`,
          "info",
        );
        expect(NodeChildProcess.spawn).toHaveBeenCalledTimes(3);
      }
      await drain;
    } finally {
      runner.forceStop();
    }
  },
);
