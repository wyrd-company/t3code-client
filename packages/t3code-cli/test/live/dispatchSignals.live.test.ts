// ---
// relationships:
//   verifies: command-line
// ---
import * as NodeChildProcess from "node:child_process";
import * as NodePath from "node:path";
import { expect, it } from "vite-plus/test";
import { threadId } from "@wyrd-company/t3code-lib";
import {
  agent,
  client,
  directory,
  ownedThreads,
  record,
  runCommand,
  useDispatchHarness,
} from "./dispatchHarness.ts";

useDispatchHarness("dispatch-signals");

function signalledCommand(sampleDelayMs?: number) {
  return new Promise<{
    exit: number | null;
    signal: string | null;
    stdout: string;
    stderr: string;
    beforeThread: boolean;
    stdinReadyAfterMs: number | undefined;
  }>((resolve, reject) => {
    const waitForStdin = sampleDelayMs === undefined;
    const startedAt = performance.now();
    const child = NodeChildProcess.spawn(
      process.execPath,
      [
        ...(waitForStdin ? ["--import", "./test/live/openStdinProbe.mjs"] : []),
        "dist/cli.js",
        ...runCommand,
        ...(waitForStdin ? [] : ["Count slowly to one hundred."]),
        "--json",
      ],
      {
        env: {
          ...process.env,
          T3C_CONFIG_HOME: NodePath.join(directory, "config"),
          T3_SERVER_URL: "",
          T3_TOKEN: "",
        },
        stdio: waitForStdin ? ["pipe", "pipe", "pipe", "ipc"] : ["pipe", "pipe", "pipe"],
      },
    );
    let stdout = "",
      stderr = "",
      beforeThread = false;
    // Both stdio configurations pipe all three streams.
    child.stdout!.on("data", (chunk: Buffer) => {
      stdout += chunk.toString();
    });
    child.stderr!.on("data", (chunk: Buffer) => {
      stderr += chunk.toString();
    });
    function interrupt() {
      beforeThread = !stderr.includes("Thread: ");
      child.kill("SIGTERM");
    }
    let stdinReadyAfterMs: number | undefined;
    if (waitForStdin) {
      child.once("message", (message) => {
        if (message !== "waiting on stdin") return;
        stdinReadyAfterMs = Math.round(performance.now() - startedAt);
        interrupt();
      });
    } else child.stdin!.end();
    const sample = sampleDelayMs === undefined ? undefined : setTimeout(interrupt, sampleDelayMs);
    let timedOut = false;
    const deadline = waitForStdin
      ? setTimeout(() => {
          timedOut = true;
          child.kill("SIGKILL");
        }, 30_000)
      : undefined;
    child.once("error", (error) => {
      clearTimeout(sample);
      clearTimeout(deadline);
      reject(error);
    });
    child.once("close", (exit, signal) => {
      clearTimeout(sample);
      clearTimeout(deadline);
      if (timedOut) {
        const stage = stdinReadyAfterMs === undefined ? "stdin readiness" : "exit";
        reject(new Error(`Timed out waiting for CLI ${stage}\n${stdout}${stderr}`));
      } else resolve({ exit, signal, stdout, stderr, beforeThread, stdinReadyAfterMs });
    });
  });
}

it("SIGTERM during open stdin exits 4 with no thread", async () => {
  const before = (await client.threads.list()).map((thread) => thread.id).sort();
  const result = await signalledCommand();
  expect(result.signal, JSON.stringify(result)).toBeNull();
  expect(
    result.stdinReadyAfterMs ?? 0,
    "CLI must report stdin readiness after 500 ms",
  ).toBeGreaterThan(500);
  expect(result.exit).toBe(4);
  expect(result.beforeThread).toBe(true);
  expect(result.stderr).not.toContain("Thread: ");
  const envelope = JSON.parse(result.stdout);
  expect(envelope).toMatchObject({
    threadId: null,
    runId: null,
    exitCode: 4,
    error: { code: "interrupted" },
  });
  expect((await client.threads.list()).map((thread) => thread.id).sort()).toEqual(before);
  record({
    case: "open stdin signal",
    stdinReadyAfterMs: result.stdinReadyAfterMs,
    exit: result.exit,
    signal: result.signal,
    beforeThread: result.beforeThread,
    envelope,
  });
});

it.skipIf(!agent)(
  "samples SIGTERM before the dispatch Thread line on the owned server",
  async () => {
    let hits = 0;
    for (const delay of [100, 150, 200]) {
      const result = await signalledCommand(delay);
      // Startup can precede handler installation. Such a sample is evidence of a missed window.
      if (result.signal !== null) {
        record({
          case: "dispatch signal sample",
          delay,
          signal: result.signal,
          window: "before handler",
        });
        continue;
      }
      expect(result.exit).toBe(4);
      const value = JSON.parse(result.stdout);
      if (value.threadId) ownedThreads.add(value.threadId);
      if (result.beforeThread) hits++;
      if (value.runId) {
        const projection = await client.threads.projection(threadId(value.threadId));
        expect(projection.runs.find((run) => run.id === value.runId)?.status).toBe("interrupted");
      } else if (value.threadId) {
        const projection = await client.threads.projection(threadId(value.threadId));
        expect(projection.runs).toHaveLength(0);
      } else expect(value.threadId).toBeNull();
      record({
        case: "dispatch signal sample",
        delay,
        beforeThread: result.beforeThread,
        threadId: value.threadId,
        runId: value.runId,
        state: value.state,
        exit: result.exit,
      });
    }
    record({
      case: "dispatch window sampling",
      hits,
      limitation:
        "Wall-clock sampling cannot prove a mutation receipt was in flight; controlled readers cover each held receipt.",
    });
  },
);
