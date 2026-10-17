// ---
// relationships:
//   verifies: testing
// ---
import * as NodeChildProcess from "node:child_process";
import { expect, it } from "vite-plus/test";
import {
  processAbsent,
  processIdentities,
} from "../packages/t3code-lib/test/live/serverEvidence.ts";

it("observes an owned process identity alive, then absent in the same namespace", async () => {
  const child = NodeChildProcess.spawn(
    process.execPath,
    ["-e", 'process.send("ready"); setInterval(() => {}, 1000)'],
    { stdio: ["ignore", "ignore", "ignore", "ipc"] },
  );
  const exited = new Promise((resolve) => child.once("exit", resolve));
  try {
    await new Promise((resolve, reject) => {
      child.once("message", resolve);
      child.once("error", reject);
    });
    expect(child.pid).toBeDefined();
    expect(processAbsent(child.pid!)).toBe(false);
    const identities = await processIdentities(child.pid!);
    expect(identities).toHaveLength(1);
    expect(identities[0]!.pid).toBe(child.pid);
    if (process.platform === "linux") {
      expect(identities[0]!.stat).toMatch(new RegExp(`^${child.pid} \\(`));
      expect(identities[0]!.executable).toBe(process.execPath);
    }
  } finally {
    child.kill("SIGTERM");
    await exited;
  }
  expect(processAbsent(child.pid!)).toBe(true);
});
