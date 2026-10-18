// ---
// relationships:
//   verifies: mcp
// ---
import * as NodeFSP from "node:fs/promises";
import * as NodePath from "node:path";
import {
  startLiveEnvironment,
  registerMcp,
  type LiveEnvironment,
} from "../support/liveEnvironment.ts";
import { cliPath } from "../support/mcpClient.ts";
export default async function setup() {
  const servers: LiveEnvironment[] = [];
  const root = await NodeFSP.mkdtemp("/tmp/mcp-live-config-");
  const stop = async () => {
    await Promise.all(servers.map((server) => server.stop()));
    await NodeFSP.rm(root, { recursive: true, force: true });
  };
  try {
    // Sequential startup keeps partial failure ownership explicit.
    servers.push(await startLiveEnvironment());
    servers.push(await startLiveEnvironment());
    const [alpha, beta] = servers as [LiveEnvironment, LiveEnvironment];
    const config = NodePath.join(root, "config.json");
    await NodeFSP.writeFile(
      config,
      JSON.stringify({
        servers: {
          alpha: { url: alpha.url, tokenEnv: "ALPHA_TOKEN" },
          beta: { url: beta.url, tokenEnv: "BETA_TOKEN" },
        },
      }),
    );
    const remoteConfig = NodePath.join(root, "remote.json");
    await NodeFSP.writeFile(
      remoteConfig,
      JSON.stringify({ servers: { beta: { url: beta.url, tokenEnv: "REMOTE_TOKEN" } } }),
    );
    if (process.env["T3_LIVE_AGENT"] === "1")
      await registerMcp(alpha.home, cliPath, remoteConfig, beta.token);
    process.env["MCP_LIVE_PAIR"] = JSON.stringify({
      alpha: { url: alpha.url, workspace: alpha.workspace },
      beta: { url: beta.url, workspace: beta.workspace },
      env: {
        HOME: root,
        T3CODE_MCP_CONFIG: config,
        ALPHA_TOKEN: alpha.token,
        BETA_TOKEN: beta.token,
      },
    });
    return stop;
  } catch (error) {
    await stop();
    throw error;
  }
}
