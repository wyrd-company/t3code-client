// ---
// relationships:
//   verifies: request-watch
// ---
import { expect, it, vi } from "vite-plus/test";
import { HookRunner } from "./hookRunner.ts";

const shellArgument = (text: string) => "'" + text.replaceAll("'", "'\\''") + "'";
const nodeEval = (script: string) =>
  `${shellArgument(process.execPath)} --input-type=module -e ${shellArgument(script)}`;

function stopEscapedProcess(pid: number): void {
  try {
    process.kill(pid, "SIGKILL");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ESRCH") throw error;
  }
}

function runQueuedHooks(first: string, timeoutMs: number) {
  const command = `
    IFS= read -r request
    if [ "$request" = "first" ]; then
      ${first}
    else
      printf 'next\\n'
    fi
  `;
  const log: { message: string; at: number }[] = [];
  const runner = new HookRunner(
    { command, concurrency: 1, timeout: `${timeoutMs}ms`, timeoutMs },
    "https://example.test",
    (message) => log.push({ message, at: performance.now() }),
  );
  runner.enqueue({ requestId: "request-1", threadId: "thread-1", line: "first\n" });
  runner.enqueue({ requestId: "request-2", threadId: "thread-1", line: "second\n" });
  return { runner, log };
}

it.skipIf(process.platform === "win32")(
  "frees the slot when the group is gone while an escaped process still holds stdout",
  async () => {
    const escaped = nodeEval(`
      import { spawn } from "node:child_process";
      const child = spawn(process.execPath, ["-e", "setTimeout(() => {}, 12000)"], {
        detached: true,
        stdio: ["ignore", "inherit", "inherit"],
      });
      child.once("spawn", () => {
        console.log("escaped", child.pid);
        process.stdout.write("last partial line");
        child.unref();
      });
    `);
    const { runner, log } = runQueuedHooks(`exec ${escaped}`, 5_000);
    const escapedPid = () => {
      const match = log
        .map(({ message }) => /^t3c: hook "request-1": escaped (\d+)$/u.exec(message))
        .find(Boolean);
      return match ? Number(match[1]) : undefined;
    };
    try {
      await vi.waitFor(
        () => expect(log.map(({ message }) => message)).toContain('t3c: hook "request-2": next'),
        { timeout: 3_000 },
      );
      await runner.drain();
      expect(log.map(({ message }) => message)).toContain(
        't3c: hook "request-1": last partial line',
      );
      expect(escapedPid()).toBeDefined();
      expect(process.kill(escapedPid()!, 0)).toBe(true);
      expect(runner.counts).toEqual({ succeeded: 2, failed: 0, stopped: 0, notRun: 0 });
    } finally {
      runner.forceStop();
      const pid = escapedPid();
      if (pid !== undefined) stopEscapedProcess(pid);
    }
  },
  8_000,
);

it.skipIf(process.platform === "win32")(
  "escalates a real process group after the shell exits and a descendant ignores TERM",
  async () => {
    const descendant = nodeEval(`
      process.on("SIGTERM", () => console.log("descendant ignored TERM"));
      setInterval(() => {}, 1000);
    `);
    const kill = vi.spyOn(process, "kill");
    const { runner, log } = runQueuedHooks(
      `trap 'echo "shell exiting on TERM"; exit 0' TERM
       printf 'group %s\\n' "$$"
       ${descendant} &
       wait`,
      1_000,
    );
    try {
      await runner.drain();
      const groupLine = log.find(({ message }) =>
        message.startsWith('t3c: hook "request-1": group '),
      );
      expect(groupLine).toBeDefined();
      const group = Number(groupLine!.message.split(" ").at(-1));
      expect(kill.mock.calls.filter(([pid, signal]) => pid === -group && signal !== 0)).toEqual([
        [-group, "SIGTERM"],
        [-group, "SIGKILL"],
      ]);
      const ignored = log.find(
        ({ message }) => message === 't3c: hook "request-1": descendant ignored TERM',
      );
      const next = log.find(({ message }) => message === 't3c: hook "request-2": next');
      expect(ignored).toBeDefined();
      expect(next).toBeDefined();
      expect(log.map(({ message }) => message)).toContain(
        't3c: hook "request-1": shell exiting on TERM',
      );
      expect(next!.at - ignored!.at).toBeGreaterThanOrEqual(4_800);
      expect(log.map(({ message }) => message)).toContain(
        't3c: hook failed for request "request-1" in thread "thread-1": timed out after 1000ms',
      );
      expect(runner.counts).toEqual({ succeeded: 1, failed: 1, stopped: 0, notRun: 0 });
    } finally {
      runner.forceStop();
      kill.mockRestore();
    }
  },
  15_000,
);
