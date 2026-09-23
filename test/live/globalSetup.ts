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

const READY_TIMEOUT_MS = 60_000;
const PROBE_TIMEOUT_MS = 2_000;

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

async function waitForReady(baseUrl: string, server: NodeChildProcess.ChildProcess) {
  const deadline = Date.now() + READY_TIMEOUT_MS;
  while (Date.now() < deadline) {
    if (server.exitCode !== null) throw new Error(`t3 exited with code ${server.exitCode}.`);
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
  const root = await NodeFSP.mkdtemp(NodePath.join(NodeOS.tmpdir(), "t3code-client-live-"));
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

  const teardown = async () => {
    if (server.exitCode === null) {
      const exited = new Promise((resolve) => server.once("exit", resolve));
      server.kill("SIGTERM");
      await exited;
    }
    await log.close();
    if (process.env["T3_LIVE_KEEP"] !== "1") {
      await NodeFSP.rm(root, { recursive: true, force: true });
    }
  };

  try {
    await waitForReady(baseUrl, server);
    process.env["T3_LIVE_URL"] = baseUrl;
    process.env["T3_LIVE_TOKEN"] = issueToken(bin, baseDir);
    process.env["T3_LIVE_HOME"] = baseDir;
    process.env["T3_LIVE_WORKSPACE"] = workspace;
  } catch (error) {
    await teardown();
    throw new Error(`Could not start the live T3 Code server; see ${root}/server.log.`, {
      cause: error,
    });
  }
  return teardown;
}
