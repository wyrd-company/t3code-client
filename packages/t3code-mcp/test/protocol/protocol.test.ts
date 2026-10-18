// ---
// relationships:
//   verifies: mcp
// ---
import * as NodeFSP from "node:fs/promises";
import * as NodePath from "node:path";
import { afterAll, beforeAll, it } from "vite-plus/test";
import { connectMcp } from "../support/mcpClient.ts";
import { readCases, runCase } from "./runner.ts";
let root: string;
beforeAll(async () => {
  root = await NodeFSP.mkdtemp("/tmp/mcp-protocol-");
  await NodeFSP.writeFile(
    NodePath.join(root, "config.json"),
    JSON.stringify({
      servers: {
        alpha: { url: "http://127.0.0.1:1", tokenEnv: "SAMPLE_TOKEN" },
        beta: { url: "http://127.0.0.1:1", tokenEnv: "SAMPLE_TOKEN" },
      },
    }),
  );
});
afterAll(async () => {
  await NodeFSP.rm(root, { recursive: true, force: true });
});
for (const spec of await readCases()) {
  it(spec.name, async () => {
    const client = await connectMcp(
      { HOME: root, T3CODE_MCP_CONFIG: NodePath.join(root, "config.json") },
      spec.flags,
    );
    try {
      await runCase(client, spec);
    } finally {
      await client.close();
    }
  });
}
