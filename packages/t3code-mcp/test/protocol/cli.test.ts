// ---
// relationships:
//   verifies: mcp
// ---
import * as NodeChildProcess from "node:child_process";
import * as NodeFSP from "node:fs/promises";
import * as NodeHttp from "node:http";
import * as NodePath from "node:path";
import * as NodeUtil from "node:util";
import { expect, it } from "vite-plus/test";

const execFile = NodeUtil.promisify(NodeChildProcess.execFile);

it.each(["flag", "stdin"])("withholds pairing response text for a %s token", async (source) => {
  const root = await NodeFSP.mkdtemp("/tmp/mcp-pair-");
  const pairing = "sample-pairing-value";
  const configured = "sample-configured-value";
  const requests: string[] = [];
  const server = NodeHttp.createServer((request, response) => {
    requests.push(request.url ?? "");
    response.writeHead(401, { "content-type": "application/json" });
    response.end(JSON.stringify({ reason: `Rejected ${pairing} and ${configured}` }));
  });
  try {
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("Missing fixture address");
    const child = NodeChildProcess.spawn(
      process.execPath,
      [
        "dist/cli.js",
        "pair",
        "alpha",
        `http://127.0.0.1:${address.port}`,
        ...(source === "flag" ? ["--token", pairing] : []),
      ],
      { env: { ...process.env, HOME: root, T3C_CONFIG_HOME: root, SAMPLE_TOKEN: configured } },
    );
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (part) => {
      stdout += part;
    });
    child.stderr.on("data", (part) => {
      stderr += part;
    });
    child.stdin.end(source === "stdin" ? `${pairing}\n` : "");
    try {
      const code = await new Promise<number | null>((resolve, reject) => {
        child.once("exit", resolve);
        child.once("error", reject);
      });
      expect(requests).toEqual(["/oauth/token"]);
      expect(code).toBe(1);
      expect(stdout).toBe("");
      expect(stderr).toBe("Pairing failed (auth_invalid).\n");
      expect(stderr).not.toContain(pairing);
      expect(stderr).not.toContain(configured);
    } finally {
      if (child.exitCode === null) child.kill("SIGKILL");
    }
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await NodeFSP.rm(root, { recursive: true, force: true });
  }
});

it("exits servers --probe after a hung profile acquisition reaches its deadline", async () => {
  const root = await NodeFSP.mkdtemp("/tmp/mcp-probe-");
  try {
    const config = NodePath.join(root, "config.json");
    const loader = NodePath.join(root, "loader.mjs");
    await NodeFSP.writeFile(config, JSON.stringify({ servers: { alpha: {} } }));
    // Inject only profile acquisition; exercise the built CLI, probe and shutdown.
    await NodeFSP.writeFile(
      loader,
      `
      import { registerHooks } from 'node:module';
      registerHooks({ load(url, context, nextLoad) {
        const result = nextLoad(url, context);
        if (url.endsWith('/profiles/profileManager.js')) {
          return { ...result, source: String(result.source).replace(
            'async resolveProfile(name) {',
            'async resolveProfile(name) { await new Promise(() => {});'
          ) };
        }
        return result;
      } });
    `,
    );
    const result = await execFile(
      process.execPath,
      ["--import", loader, "dist/cli.js", "servers", "--probe", "--config", config],
      { env: { ...process.env, HOME: root, T3C_CONFIG_HOME: root }, timeout: 8000 },
    );
    expect(JSON.parse(result.stdout)).toMatchObject({
      servers: [
        {
          server: "alpha",
          reachable: false,
          error: { code: "server_unreachable", message: "Server probe exceeded the 5 s deadline." },
        },
      ],
    });
    expect(result.stderr).toBe("");
  } finally {
    await NodeFSP.rm(root, { recursive: true, force: true });
  }
});
