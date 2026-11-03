// ---
// relationships:
//   verifies: proxy
// ---
/**
 * Starts the isolated environment of the live proof: the pinned stock `t3` with its own home, the
 * built `t3c-proxy` executable, and Caddy with HTTPS and one hostname per person. It starts and
 * stops only its own processes. A missing tool or setting fails the proof.
 */
import * as NodeChildProcess from "node:child_process";
import * as NodeFS from "node:fs";
import * as NodeFSP from "node:fs/promises";
import * as NodeHttps from "node:https";
import * as NodeOS from "node:os";
import * as NodePath from "node:path";
import {
  freePort,
  hasExited,
  issueToken,
  serverBin,
  spawnServer,
  waitForReady,
} from "../../../t3code-lib/test/live/globalSetup.ts";
import { runInOwnGroup, startBrowserBroker } from "../support/browserBroker.ts";
import { stopAllOwned } from "../support/ownedProcesses.ts";

const PEOPLE = ["Alice", "Sam"] as const;
const DOMAIN = "dev.example.test";
const READY_TIMEOUT_MS = 30_000;
const STOP_GRACE_MS = 10_000;
const PARENT_WATCH_MS = 1_000;
const BROWSER_CLOSE_TIMEOUT_MS = 30_000;
const BROWSER_COMMAND_TIMEOUT_MS = 60_000;
// Longer than any test, so that it cannot end a browser that a test waits on. It ends a daemon that
// no stop can reach, for example after SIGKILL.
const BROWSER_IDLE_TIMEOUT_MS = 600_000;
const packageRoot = NodePath.resolve(import.meta.dirname, "../..");

const run = (command: string, args: readonly string[], cwd: string) =>
  NodeChildProcess.execFileSync(command, args, { cwd, stdio: ["ignore", "pipe", "pipe"] });

function requireTools() {
  for (const [tool, args] of [
    ["caddy", ["version"]],
    ["openssl", ["version"]],
    ["agent-browser", ["--version"]],
  ] as const) {
    const found = NodeChildProcess.spawnSync(tool, args, { stdio: "ignore" });
    if (found.status !== 0) throw new Error(`The live proof needs ${tool} on PATH.`);
  }
  if (!process.env["CODEX_HOME"]) {
    throw new Error("The live proof needs CODEX_HOME set to a Codex test profile.");
  }
  if (!NodeFS.existsSync(NodePath.join(packageRoot, "dist/cli.js"))) {
    throw new Error("The live proof needs the built proxy. Run `task proxy:test:proof`.");
  }
}

function makeCertificates(directory: string) {
  const key = ["-newkey", "ec", "-pkeyopt", "ec_paramgen_curve:prime256v1", "-nodes"];
  run(
    "openssl",
    ["req", "-x509", ...key, "-days", "2", "-subj", "/CN=Proof CA"].concat([
      "-keyout",
      "ca.key",
      "-out",
      "ca.crt",
    ]),
    directory,
  );
  run(
    "openssl",
    ["req", ...key, "-subj", `/CN=*.${DOMAIN}`, "-keyout", "site.key", "-out", "site.csr"],
    directory,
  );
  NodeFS.writeFileSync(
    NodePath.join(directory, "site.ext"),
    `subjectAltName=DNS:*.${DOMAIN}\nbasicConstraints=CA:FALSE\n`,
  );
  run(
    "openssl",
    [
      "x509",
      "-req",
      "-in",
      "site.csr",
      "-CA",
      "ca.crt",
      "-CAkey",
      "ca.key",
      "-CAcreateserial",
    ].concat(["-days", "2", "-extfile", "site.ext", "-out", "site.crt"]),
    directory,
  );
}

/** Whether Caddy answers for one hostname with the test certificate. */
const answers = (host: string, port: number, ca: string) =>
  new Promise<boolean>((resolve) => {
    const request = NodeHttps.get(
      {
        host: "127.0.0.1",
        port,
        servername: host,
        ca,
        path: "/.well-known/t3/environment",
        headers: { host: `${host}:${port}` },
        timeout: 2_000,
      },
      (response) => {
        response.resume();
        resolve(response.statusCode === 200);
      },
    );
    request.on("error", () => resolve(false));
    request.on("timeout", () => request.destroy());
  });

/**
 * Vitest answers these signals by exiting, without teardown. The proof answers instead, so that a
 * stopped run also stops what it started. A second signal has the default effect. `vp` does not
 * forward a signal to Vitest, so the end of the parent process is a stop too.
 */
function stopWhenStopped(stop: () => Promise<void>) {
  for (const [signal, number] of [
    ["SIGTERM", 15],
    ["SIGINT", 2],
  ] as const) {
    process.removeAllListeners(signal);
    process.once(signal, () => void stop().finally(() => process.exit(128 + number)));
  }
  const parent = process.ppid;
  const watch = setInterval(() => {
    if (process.ppid === parent) return;
    clearInterval(watch);
    void stop().finally(() => process.exit(1));
  }, PARENT_WATCH_MS);
  watch.unref();
}

export default async function setup() {
  requireTools();
  // An inherited value can name another T3 Code server. Each process below inherits this.
  for (const name of ["T3CODE_PORT", "T3CODE_HOST", "T3CODE_HOME"]) delete process.env[name];
  const root = await NodeFSP.mkdtemp(NodePath.join(NodeOS.tmpdir(), "t3code-proxy-proof-"));
  const baseDir = NodePath.join(root, "home");
  const workspace = NodePath.join(root, "workspace");
  const caddyHome = NodePath.join(root, "caddy");
  await NodeFSP.mkdir(workspace, { recursive: true });
  await NodeFSP.mkdir(caddyHome, { recursive: true });
  // Every `agent-browser` process inherits these, so that its sockets and state stay in the root.
  process.env["AGENT_BROWSER_SOCKET_DIR"] = NodePath.join(root, "browser");
  process.env["AGENT_BROWSER_NAMESPACE"] = `t3code-proxy-proof-${process.pid}`;
  process.env["AGENT_BROWSER_IDLE_TIMEOUT_MS"] = String(BROWSER_IDLE_TIMEOUT_MS);
  const browsers = await startBrowserBroker((args) =>
    runInOwnGroup("agent-browser", args, BROWSER_COMMAND_TIMEOUT_MS),
  );
  process.env["T3_PROOF_BROWSER_BROKER"] = browsers.url;
  await NodeFSP.writeFile(NodePath.join(workspace, "README.md"), "Sample workspace.\n");
  // A message with only an attachment has no request in it. This makes each reply show what the
  // agent received, and it names no colour or file content.
  await NodeFSP.writeFile(
    NodePath.join(workspace, "AGENTS.md"),
    "When a message has an attachment and no request, do not ask a question. Reply with the main colour of an attached image, or read an attached file with a tool and reply with its exact text.\n",
  );
  makeCertificates(root);

  const log = (name: string) => NodeFS.openSync(NodePath.join(root, name), "w");
  const children: NodeChildProcess.ChildProcess[] = [];
  let stopping: Promise<void> | undefined;
  const stop = () =>
    (stopping ??= (async () => {
      try {
        await browsers.drain();
        await runInOwnGroup("agent-browser", ["close", "--all"], BROWSER_CLOSE_TIMEOUT_MS).catch(
          () => undefined,
        );
        await stopAllOwned(children, STOP_GRACE_MS);
      } finally {
        browsers.close();
        if (process.env["T3_LIVE_KEEP"] !== "1") {
          await NodeFSP.rm(root, { recursive: true, force: true });
        }
      }
    })());
  stopWhenStopped(stop);

  try {
    const bin = serverBin();
    const serverPort = await freePort();
    const direct = `http://127.0.0.1:${serverPort}`;
    const server = spawnServer({
      bin,
      port: serverPort,
      baseDir,
      workspace,
      logFd: log("server.log"),
    });
    children.push(server);
    await waitForReady(direct, server);

    const users = [];
    for (const name of PEOPLE) users.push({ name, port: await freePort() });
    const configPath = NodePath.join(root, "proxy.json");
    // YAML is a superset of JSON.
    await NodeFSP.writeFile(configPath, JSON.stringify({ upstream: direct, users }));
    children.push(
      NodeChildProcess.spawn(
        process.execPath,
        [NodePath.join(packageRoot, "dist/cli.js"), "--config", configPath],
        { stdio: ["ignore", log("proxy.log"), log("proxy.log")] },
      ),
    );

    const httpsPort = await freePort();
    const httpPort = await freePort();
    const hostname = (label: string) => `${label}.${DOMAIN}`;
    const site = (label: string, port: number) =>
      `${hostname(label)}:${httpsPort} {\n\ttls ${root}/site.crt ${root}/site.key\n\treverse_proxy 127.0.0.1:${port}\n}\n`;
    const caddyfile = `{\n\tadmin off\n\tpersist_config off\n\tauto_https disable_redirects\n\thttp_port ${httpPort}\n\thttps_port ${httpsPort}\n}\n${site("t3", serverPort)}${users.map((user) => site(`t3-${user.name.toLowerCase()}`, user.port)).join("")}`;
    const caddyConfig = NodePath.join(root, "Caddyfile");
    await NodeFSP.writeFile(caddyConfig, caddyfile);
    const caddy = NodeChildProcess.spawn(
      "caddy",
      ["run", "--config", caddyConfig, "--adapter", "caddyfile"],
      {
        stdio: ["ignore", log("caddy.log"), log("caddy.err")],
        env: {
          PATH: process.env["PATH"],
          HOME: caddyHome,
          XDG_DATA_HOME: caddyHome,
          XDG_CONFIG_HOME: caddyHome,
        },
      },
    );
    children.push(caddy);

    const ca = await NodeFSP.readFile(NodePath.join(root, "ca.crt"), "utf8");
    const labels = ["t3", ...users.map((user) => `t3-${user.name.toLowerCase()}`)];
    const deadline = Date.now() + READY_TIMEOUT_MS;
    for (const label of labels) {
      while (!(await answers(hostname(label), httpsPort, ca))) {
        if (hasExited(caddy) || Date.now() > deadline) {
          // Caddy's errors name ports and hostnames. It sees no token, because it logs no requests.
          const errors = NodeFS.readFileSync(NodePath.join(root, "caddy.err"), "utf8");
          throw new Error(
            `The HTTPS route of ${label} did not answer. Caddy exit: ${caddy.exitCode ?? "running"}. ` +
              `Last line: ${errors.trim().split("\n").at(-1)}`,
          );
        }
        await new Promise((resolve) => setTimeout(resolve, 200));
      }
    }

    // The test workers read these when they start. The proof owns its server, so that no setting
    // can select another one.
    process.env["NODE_EXTRA_CA_CERTS"] = NodePath.join(root, "ca.crt");
    process.env["T3_PROOF_BIN"] = bin;
    process.env["T3_PROOF_HOME"] = baseDir;
    process.env["T3_PROOF_WORKSPACE"] = workspace;
    process.env["T3_PROOF_TOKEN"] = issueToken(bin, baseDir);
    process.env["T3_PROOF_DIRECT"] = `https://${hostname("t3")}:${httpsPort}`;
    process.env["T3_PROOF_ALICE"] = `https://${hostname("t3-alice")}:${httpsPort}`;
    process.env["T3_PROOF_SAM"] = `https://${hostname("t3-sam")}:${httpsPort}`;
  } catch (error) {
    await stop();
    throw new Error(`The live proof could not start: ${(error as Error).message}`, {
      cause: error,
    });
  }
  return stop;
}
