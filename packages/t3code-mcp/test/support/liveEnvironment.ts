// ---
// relationships:
//   verifies: mcp
// ---
import * as NodeChildProcess from "node:child_process";
import * as NodeFSP from "node:fs/promises";
import * as NodeModule from "node:module";
import * as NodeNet from "node:net";
import * as NodeOS from "node:os";
import * as NodePath from "node:path";
export interface LiveEnvironment {
  root: string;
  home: string;
  workspace: string;
  url: string;
  token: string;
  stop(): Promise<void>;
}
export function cleanEnv(home: string): Record<string, string> {
  return {
    ...Object.fromEntries(
      Object.entries(process.env).filter(
        (entry): entry is [string, string] =>
          entry[1] !== undefined && !/^(CLAUDE|CODEX_|AI_AGENT|T3_|T3CODE_|XDG_)/.test(entry[0]),
      ),
    ),
    HOME: home,
    T3CODE_NO_BROWSER: "1",
  };
}
async function copyAuth(home: string) {
  if (process.env["T3_LIVE_AGENT"] !== "1") return;
  for (const relative of [".codex/auth.json", ".claude/.credentials.json"]) {
    const dest = NodePath.join(home, relative);
    await NodeFSP.mkdir(NodePath.dirname(dest), { recursive: true, mode: 0o700 });
    try {
      await NodeFSP.copyFile(NodePath.join(NodeOS.homedir(), relative), dest);
      await NodeFSP.chmod(dest, 0o600);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
  }
  // Retain provider selection/endpoints needed for authentication. Exclude all
  // operational MCP registrations, hooks, projects and policy overrides.
  let config = "";
  try {
    const source = await NodeFSP.readFile(
      NodePath.join(NodeOS.homedir(), ".codex/config.toml"),
      "utf8",
    );
    let section = "";
    config = source
      .split("\n")
      .filter((line) => {
        if (/^\s*\[/.test(line)) section = line;
        if (section) return /^\s*\[model_providers(?:\.|\])/.test(section);
        return /^\s*(model_provider|chatgpt_base_url|openai_base_url|forced_login_method|forced_chatgpt_workspace_id)\s*=/.test(
          line,
        );
      })
      .join("\n");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  await NodeFSP.mkdir(NodePath.join(home, ".codex"), { recursive: true, mode: 0o700 });
  await NodeFSP.writeFile(NodePath.join(home, ".codex/config.toml"), config, { mode: 0o600 });
}
async function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const probe = NodeNet.createServer();
    probe.once("error", reject);
    probe.listen(0, "127.0.0.1", () => {
      const address = probe.address();
      probe.close(() =>
        typeof address === "object" && address !== null
          ? resolve(address.port)
          : reject(new Error("No port assigned.")),
      );
    });
  });
}
export async function registerMcp(home: string, cli: string, config: string, token: string) {
  await NodeFSP.appendFile(
    NodePath.join(home, ".codex/config.toml"),
    [
      "",
      "[mcp_servers.t3code-mcp]",
      `command = ${JSON.stringify(process.execPath)}`,
      `args = [${JSON.stringify(cli)}]`,
      "tool_timeout_sec = 660",
      "startup_timeout_sec = 30",
      'default_tools_approval_mode = "approve"',
      "[mcp_servers.t3code-mcp.env]",
      `T3CODE_MCP_CONFIG = ${JSON.stringify(config)}`,
      `REMOTE_TOKEN = ${JSON.stringify(token)}`,
      "",
    ].join("\n"),
    { mode: 0o600 },
  );
  await NodeFSP.writeFile(
    NodePath.join(home, ".claude.json"),
    JSON.stringify({
      hasCompletedOnboarding: true,
      mcpServers: {
        "t3code-mcp": {
          type: "stdio",
          command: process.execPath,
          args: [cli],
          env: { T3CODE_MCP_CONFIG: config, REMOTE_TOKEN: token },
        },
      },
    }),
    { mode: 0o600 },
  );
}
export async function startLiveEnvironment(): Promise<LiveEnvironment> {
  const root = await NodeFSP.mkdtemp("/tmp/t3code-mcp-live-");
  const home = NodePath.join(root, "home");
  const baseDir = NodePath.join(root, "data");
  const workspace = NodePath.join(root, "workspace");
  await NodeFSP.mkdir(workspace, { recursive: true });
  await NodeFSP.mkdir(home, { recursive: true, mode: 0o700 });
  await copyAuth(home);
  const bin = NodePath.join(
    NodePath.dirname(NodeModule.createRequire(import.meta.url).resolve("t3/package.json")),
    "dist/bin.mjs",
  );
  const url = `http://127.0.0.1:${await freePort()}`;
  const log = await NodeFSP.open(NodePath.join(root, "server.log"), "w", 0o600);
  const env = cleanEnv(home);
  const child = NodeChildProcess.spawn(
    process.execPath,
    [
      bin,
      "serve",
      "--host",
      "127.0.0.1",
      "--port",
      new URL(url).port,
      "--base-dir",
      baseDir,
      "--no-browser",
      "--log-level",
      "warn",
      workspace,
    ],
    { env, stdio: ["ignore", log.fd, log.fd], detached: process.platform !== "win32" },
  );
  let spawnError: Error | undefined;
  child.on("error", (error) => {
    spawnError = error;
  });
  const stop = async () => {
    const exited = child.exitCode !== null || child.signalCode !== null;
    const exit = exited
      ? Promise.resolve()
      : new Promise<void>((resolve) => child.once("exit", () => resolve()));
    const kill = (signal: NodeJS.Signals) => {
      try {
        if (child.pid && process.platform !== "win32") process.kill(-child.pid, signal);
        else child.kill(signal);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ESRCH") throw error;
      }
    };
    kill("SIGTERM");
    const fallback = setTimeout(() => kill("SIGKILL"), 10_000);
    await exit;
    clearTimeout(fallback);
    // The launcher can exit before its native child; signal the owned group again.
    kill("SIGKILL");
    const stillListening = await fetch(new URL("/.well-known/t3/environment", url), {
      signal: AbortSignal.timeout(2000),
    }).then(
      () => true,
      () => false,
    );
    await log.close();
    await NodeFSP.rm(root, { recursive: true, force: true });
    if (stillListening) throw new Error("Owned temporary server still answers after shutdown.");
    console.log(`Stopped owned MCP live server, confirmed endpoint closed and removed ${root}`);
  };
  try {
    const deadline = Date.now() + 90_000;
    let ready = false;
    while (Date.now() < deadline) {
      if (spawnError || child.exitCode !== null || child.signalCode !== null)
        throw new Error("Temporary server exited before readiness.");
      try {
        ready = (
          await fetch(new URL("/.well-known/t3/environment", url), {
            signal: AbortSignal.timeout(2000),
          })
        ).ok;
      } catch {
        /* readiness retry */
      }
      if (ready) break;
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
    if (!ready) throw new Error("Temporary server readiness deadline exceeded.");
    const token = NodeChildProcess.execFileSync(
      process.execPath,
      [
        bin,
        "auth",
        "session",
        "issue",
        "--base-dir",
        baseDir,
        "--label",
        "sample-mcp-tests",
        "--token-only",
      ],
      { encoding: "utf8", env, stdio: ["ignore", "pipe", "pipe"] },
    ).trim();
    console.log(`Started owned MCP live server at ${url} with home ${home}`);
    return { root, home, workspace, url, token, stop };
  } catch (error) {
    await stop();
    throw error;
  }
}
