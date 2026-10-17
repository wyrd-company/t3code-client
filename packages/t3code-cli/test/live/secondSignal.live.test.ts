// ---
// relationships:
//   verifies: command-line
// ---
import * as NodeChildProcess from "node:child_process";
import * as NodePath from "node:path";
import { expect, it } from "vite-plus/test";
import {
  agent,
  directory,
  ownedThreads,
  record,
  runCommand,
  useDispatchHarness,
} from "./dispatchHarness.ts";

useDispatchHarness("second-signal");
it.skipIf(!agent)("a second signal exits the real CLI immediately after dispatch", async () => {
  const result = await new Promise<{
    exit: number | null;
    signal: string | null;
    stdout: string;
    stderr: string;
    elapsedAfterSignals: number;
  }>((resolve, reject) => {
    const child = NodeChildProcess.spawn(
      process.execPath,
      [
        "dist/cli.js",
        ...runCommand,
        "Use the shell tool to sleep 30 seconds, then reply SAMPLE only.",
        "--json",
      ],
      {
        env: {
          ...process.env,
          T3C_CONFIG_HOME: NodePath.join(directory, "config"),
          T3_SERVER_URL: "",
          T3_TOKEN: "",
        },
        stdio: ["ignore", "pipe", "pipe"],
      },
    );
    let stdout = "",
      stderr = "",
      sentAt = 0;
    child.stdout.on("data", (chunk: Buffer) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString();
      const id = /Thread: ([^\n]+)/.exec(stderr)?.[1];
      if (id && !sentAt) {
        ownedThreads.add(id);
        sentAt = Date.now();
        // Different signals cannot coalesce into one pending POSIX signal.
        child.kill("SIGINT");
        child.kill("SIGTERM");
      }
    });
    child.once("error", reject);
    child.once("close", (exit, signal) =>
      resolve({ exit, signal, stdout, stderr, elapsedAfterSignals: Date.now() - sentAt }),
    );
  });
  record({ case: "second signal actual CLI", ...result });
  expect(result.signal).toBeNull();
  expect(result.exit).toBe(4);
  expect(result.stderr).toContain("t3c: Operation interrupted.");
  // The second branch exits synchronously: it emits no final execution envelope.
  expect(result.stdout).toBe("");
});
