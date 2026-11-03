// ---
// relationships:
//   verifies: proxy
// ---
/**
 * Runs the proof's real setup in a separate Vitest, with one browser, and checks what stays after
 * the run. The daemon comes from `agent-browser session info` in the run's namespace.
 */
import * as NodeChildProcess from "node:child_process";
import * as NodeFS from "node:fs";
import * as NodeFSP from "node:fs/promises";
import * as NodeOS from "node:os";
import * as NodePath from "node:path";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vite-plus/test";

const packageRoot = NodePath.resolve(import.meta.dirname, "../..");
const vp = NodePath.resolve(packageRoot, "../../node_modules/.bin/vp");
// More than the stop of every owned process when each one needs its full grace time.
const SETTLE = { timeout: 45_000, interval: 200 };

interface Report {
  daemonPid: number;
  workerPid: number;
  vitestPid: number;
  cdpUrl: string;
  namespace: string;
  socketDir: string;
}

const alive = (pid: number) => {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
};

/** A closed browser no longer answers on its DevTools port. */
const browserAnswers = (cdpUrl: string) =>
  fetch(`http://${new URL(cdpUrl).host}/json/version`).then(
    () => true,
    () => false,
  );

describe("what a proof run leaves", () => {
  let scratch: string;

  beforeAll(async () => {
    scratch = await NodeFSP.mkdtemp(NodePath.join(NodeOS.tmpdir(), "t3code-proxy-lifetime-"));
  });
  afterAll(() => NodeFSP.rm(scratch, { recursive: true, force: true }));

  // A case that fails before its stop still stops its run. A second signal to a stopping run would
  // end it before its stop finishes.
  let current: { signalled: boolean; pid: number; closed: Promise<void> } | undefined;
  afterEach(async () => {
    if (!current) return;
    if (!current.signalled) {
      try {
        process.kill(-current.pid, "SIGTERM");
      } catch {
        // A run that ended has no process group left.
      }
    }
    await Promise.race([
      current.closed,
      new Promise((resolve) => setTimeout(resolve, SETTLE.timeout)),
    ]);
    current = undefined;
  });

  const start = (name: string, hold: boolean, owner = process.pid) => {
    const reportPath = NodePath.join(scratch, `${name}.json`);
    const run = NodeChildProcess.spawn(
      vp,
      ["test", "run", "--config", "test/proof/fixtures/vitest.config.ts"],
      {
        cwd: packageRoot,
        // Its own process group, as `timeout` makes, so that a group signal reaches no other run.
        detached: true,
        stdio: ["ignore", "pipe", "pipe"],
        env: {
          ...process.env,
          T3_PROOF_LIFETIME_REPORT: reportPath,
          T3_PROOF_LIFETIME_HOLD: hold ? "1" : "0",
          T3_PROOF_LIFETIME_OWNER: String(owner),
        },
      },
    );
    let output = "";
    run.stdout.on("data", (chunk) => (output += String(chunk)));
    run.stderr.on("data", (chunk) => (output += String(chunk)));
    const ended = new Promise<number | null>((resolve) => run.once("exit", resolve));
    // The output stays open until Vitest and its workers end, also after `vp` ends.
    const closed = new Promise<void>((resolve) => run.once("close", () => resolve()));
    current = { signalled: false, pid: run.pid as number, closed };
    const report = async () => {
      await vi.waitFor(() => expect(NodeFS.existsSync(reportPath), output).toBe(true), {
        timeout: 120_000,
        interval: 200,
      });
      return JSON.parse(await NodeFSP.readFile(reportPath, "utf8")) as Report;
    };
    return { run, ended, report, output: () => output };
  };

  const expectNothingLeft = async (report: Report) => {
    await vi.waitFor(async () => {
      expect(alive(report.vitestPid), "Vitest").toBe(false);
      expect(alive(report.daemonPid), "daemon").toBe(false);
      expect(alive(report.workerPid), "test worker").toBe(false);
      expect(await browserAnswers(report.cdpUrl), "browser").toBe(false);
    }, SETTLE);
    // The socket folder is inside the run's own root.
    expect(NodeFS.existsSync(NodePath.dirname(report.socketDir)), "run root").toBe(false);
    const home = NodePath.join(NodeOS.homedir(), ".agent-browser/namespaces", report.namespace);
    expect(NodeFS.existsSync(home), "namespace folder").toBe(false);
  };

  it("a completed run leaves no namespace folder, daemon or browser", async () => {
    const proof = start("completed", false);
    const report = await proof.report();
    expect(await proof.ended, proof.output()).toBe(0);
    await expectNothingLeft(report);
  });

  const expectStopLeavesNothing = async (name: string, signal: (pid: number) => void) => {
    const proof = start(name, true);
    const report = await proof.report();
    expect(alive(report.daemonPid)).toBe(true);
    expect(await browserAnswers(report.cdpUrl)).toBe(true);
    (current as { signalled: boolean }).signalled = true;
    signal(proof.run.pid as number);
    await expectNothingLeft(report);
    // A command that ran after the browser closed would start it again here.
    await new Promise((resolve) => setTimeout(resolve, 3_000));
    await expectNothingLeft(report);
  };

  it("a run stopped by SIGTERM to its process group leaves no daemon or browser", () =>
    expectStopLeavesNothing("group", (pid) => process.kill(-pid, "SIGTERM")));

  it("a run stopped by SIGTERM to its top process leaves no daemon or browser", async () => {
    await expectStopLeavesNothing("top", (pid) => process.kill(pid, "SIGTERM"));
    // Vitest and its worker outlast the start of this stop, so the worker sent another command.
    expect(NodeFS.existsSync(NodePath.join(scratch, "top.json.refused")), "refused").toBe(true);
  });

  it("a held run ends when its owner ends, as when this proof is stopped", async () => {
    const owner = NodeChildProcess.spawn(process.execPath, ["-e", "setInterval(()=>{},1000)"], {
      stdio: "ignore",
    });
    try {
      const proof = start("owner", true, owner.pid as number);
      const report = await proof.report();
      const exited = new Promise((resolve) => owner.once("exit", resolve));
      owner.kill("SIGKILL");
      await exited;
      expect(await proof.ended, proof.output()).toBe(0);
      await expectNothingLeft(report);
    } finally {
      owner.kill("SIGKILL");
    }
  });
});
