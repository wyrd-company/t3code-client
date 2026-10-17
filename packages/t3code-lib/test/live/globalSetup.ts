/**
 * Starts the pinned `t3` devDependency on a free loopback port with its own
 * data directory, issues a bearer token, and exposes both to the live tests
 * through `T3_LIVE_URL` and `T3_LIVE_TOKEN`. When both are already set the
 * tests run against that server instead and nothing is started.
 */
import * as NodeChildProcess from "node:child_process";
import * as NodeFSP from "node:fs/promises";
import * as NodeModule from "node:module";
import * as NodeNet from "node:net";
import * as NodeOS from "node:os";
import * as NodePath from "node:path";

import { processAbsent, processIdentities } from "./serverEvidence.ts";

const READY_TIMEOUT_MS = 60_000;
const PROBE_TIMEOUT_MS = 2_000;
const LOG_TAIL_LINES = 40;

function serverBin(): string {
  const require = NodeModule.createRequire(import.meta.url);
  const manifest = require.resolve("t3/package.json");
  return NodePath.join(NodePath.dirname(manifest), "dist", "bin.mjs");
}

function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const probe = NodeNet.createServer();
    probe.once("error", reject);
    probe.listen(0, "127.0.0.1", () => {
      const address = probe.address();
      probe.close(() =>
        typeof address === "object" && address !== null
          ? resolve(address.port)
          : reject(new Error("No port was assigned.")),
      );
    });
  });
}

/** Whether the process has ended, by exit code or by signal. */
function hasExited(child: NodeChildProcess.ChildProcess): boolean {
  return child.exitCode !== null || child.signalCode !== null;
}

async function waitForReady(baseUrl: string, server: NodeChildProcess.ChildProcess) {
  const deadline = Date.now() + READY_TIMEOUT_MS;
  while (Date.now() < deadline) {
    if (hasExited(server)) {
      throw new Error(`t3 exited (${server.exitCode ?? server.signalCode}).`);
    }
    try {
      // The server accepts connections before it can answer them, so each probe
      // gets its own deadline.
      const response = await fetch(new URL("/.well-known/t3/environment", baseUrl), {
        signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
      });
      if (response.ok) return;
    } catch {
      // Not answering yet.
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`t3 was not ready within ${READY_TIMEOUT_MS} ms.`);
}

function issueToken(bin: string, baseDir: string): string {
  const output = NodeChildProcess.execFileSync(
    process.execPath,
    [
      bin,
      "auth",
      "session",
      "issue",
      "--base-dir",
      baseDir,
      "--label",
      "live-tests",
      "--token-only",
    ],
    { encoding: "utf8" },
  );
  return output.trim();
}

export default async function setup(): Promise<(() => Promise<void>) | undefined> {
  if (process.env["T3_LIVE_URL"] && process.env["T3_LIVE_TOKEN"]) return undefined;

  const bin = serverBin();
  const root = await NodeFSP.mkdtemp(NodePath.join(NodeOS.tmpdir(), "t3code-lib-live-"));
  const baseDir = NodePath.join(root, "home");
  const workspace = NodePath.join(root, "workspace");
  await NodeFSP.mkdir(workspace, { recursive: true });
  const port = await freePort();
  const baseUrl = `http://127.0.0.1:${port}`;
  const log = await NodeFSP.open(NodePath.join(root, "server.log"), "w");

  const server = NodeChildProcess.spawn(
    process.execPath,
    [
      bin,
      "serve",
      "--port",
      String(port),
      "--host",
      "127.0.0.1",
      "--base-dir",
      baseDir,
      "--no-browser",
      "--log-level",
      "warn",
      workspace,
    ],
    { stdio: ["ignore", log.fd, log.fd] },
  );

  let ownedProcesses: Awaited<ReturnType<typeof processIdentities>> = [];
  const evidenceDir = process.env["T3_LIVE_EVIDENCE_DIR"];
  const identity = {
    pid: server.pid,
    startedAt: new Date().toISOString(),
    bin,
    root,
    baseDir,
    workspace,
    baseUrl,
    platform: process.platform,
    startIdentity:
      server.pid && process.platform === "linux"
        ? await NodeFSP.readFile(`/proc/${server.pid}/stat`, "utf8").catch(() => null)
        : null,
  };
  const writeEvidence = async (phase: string, extra: object = {}) => {
    if (!evidenceDir) return;
    await NodeFSP.mkdir(evidenceDir, { recursive: true });
    await NodeFSP.writeFile(
      NodePath.join(evidenceDir, `${NodePath.basename(root)}-${phase}.json`),
      JSON.stringify({ ...identity, phase, ...extra }, null, 2),
    );
  };

  const stop = async () => {
    if (!hasExited(server)) {
      const exited = new Promise((resolve) => server.once("exit", resolve));
      server.kill("SIGTERM");
      await exited;
    }
    await log.close();
    await writeEvidence("stopped", {
      exitCode: server.exitCode,
      signalCode: server.signalCode,
      pidAbsent: server.pid !== undefined && processAbsent(server.pid),
      ownedProcesses: ownedProcesses.map((identity) => ({
        ...identity,
        absent: processAbsent(identity.pid),
      })),
    });
  };

  const teardown = async () => {
    await stop();
    if (evidenceDir) {
      const output = await NodeFSP.readFile(NodePath.join(root, "server.log"), "utf8");
      const session = process.env["T3_LIVE_TOKEN"];
      const sanitized = (session ? output.replaceAll(session, "[redacted]") : output)
        .replace(/Bearer\s+[^\s"']+/gi, "Bearer [redacted]")
        .replace(
          /((?:token|credential|secret|password|ticket)["']?\s*[:=]\s*["']?)[^\s,"'}]+/gi,
          "$1[redacted]",
        );
      await NodeFSP.writeFile(
        NodePath.join(evidenceDir, `${NodePath.basename(root)}-server.log`),
        sanitized,
      );
    }
    if (process.env["T3_LIVE_KEEP"] !== "1") {
      await NodeFSP.rm(root, { recursive: true, force: true });
    }
    await writeEvidence("cleanup", {
      rootAbsent: await NodeFSP.stat(root).then(
        () => false,
        (error) => {
          if ((error as NodeJS.ErrnoException).code === "ENOENT") return true;
          throw error;
        },
      ),
      kept: process.env["T3_LIVE_KEEP"] === "1",
    });
  };

  try {
    await writeEvidence("started");
    await waitForReady(baseUrl, server);
    if (server.pid) ownedProcesses = await processIdentities(server.pid);
    const descriptor = (await fetch(new URL("/.well-known/t3/environment", baseUrl)).then(
      (response) => response.json(),
    )) as Record<string, unknown>;
    await writeEvidence("ready", {
      ownedProcesses,
      serverVersion: descriptor["serverVersion"],
      protocol: descriptor["orchestrationProtocolVersion"],
    });
    process.env["T3_LIVE_URL"] = baseUrl;
    process.env["T3_LIVE_TOKEN"] = issueToken(bin, baseDir);
    process.env["T3_LIVE_HOME"] = baseDir;
    process.env["T3_LIVE_WORKSPACE"] = workspace;
  } catch (error) {
    // Keep the data directory so the log named below still exists.
    await stop();
    const output = await NodeFSP.readFile(NodePath.join(root, "server.log"), "utf8");
    const tail = output.split("\n").slice(-LOG_TAIL_LINES).join("\n");
    throw new Error(
      `Could not start the live T3 Code server; see ${root}/server.log. Last output:\n${tail}`,
      { cause: error },
    );
  }
  return teardown;
}
