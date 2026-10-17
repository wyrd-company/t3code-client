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

function signalledCommand(prompt: boolean, delay: number) {
  return new Promise<{
    exit: number | null;
    signal: string | null;
    stdout: string;
    stderr: string;
    beforeThread: boolean;
  }>((resolve, reject) => {
    const child = NodeChildProcess.spawn(
      process.execPath,
      ["dist/cli.js", ...runCommand, ...(prompt ? ["Count slowly to one hundred."] : []), "--json"],
      {
        env: {
          ...process.env,
          T3C_CONFIG_HOME: NodePath.join(directory, "config"),
          T3_SERVER_URL: "",
          T3_TOKEN: "",
        },
        stdio: ["pipe", "pipe", "pipe"],
      },
    );
    let stdout = "",
      stderr = "",
      beforeThread = false;
    child.stdout.on("data", (chunk: Buffer) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString();
    });
    const timer = setTimeout(() => {
      beforeThread = !stderr.includes("Thread: ");
      child.kill("SIGTERM");
    }, delay);
    child.once("error", reject);
    child.once("close", (exit, signal) => {
      clearTimeout(timer);
      resolve({ exit, signal, stdout, stderr, beforeThread });
    });
    if (prompt) child.stdin.end();
  });
}

it("SIGTERM during open stdin exits 4 with no thread", async () => {
  const before = (await client.threads.list()).map((thread) => thread.id).sort();
  const result = await signalledCommand(false, 500);
  expect(result.signal).toBeNull();
  expect(result.exit).toBe(4);
  expect(result.beforeThread).toBe(true);
  expect(JSON.parse(result.stdout)).toMatchObject({ threadId: null, runId: null, exitCode: 4 });
  expect((await client.threads.list()).map((thread) => thread.id).sort()).toEqual(before);
  record({
    case: "open stdin signal",
    exit: result.exit,
    threadId: null,
    beforeThread: result.beforeThread,
  });
});

it.skipIf(!agent)(
  "samples SIGTERM before the dispatch Thread line on the owned server",
  async () => {
    let hits = 0;
    for (const delay of [100, 150, 200]) {
      const result = await signalledCommand(true, delay);
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
