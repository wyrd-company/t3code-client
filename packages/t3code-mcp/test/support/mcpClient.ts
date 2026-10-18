// ---
// relationships:
//   verifies: mcp
// ---
import * as NodePath from "node:path";
import { Client } from "@modelcontextprotocol/client";
import { StdioClientTransport } from "@modelcontextprotocol/client/stdio";
export const cliPath = NodePath.resolve(import.meta.dirname, "../../dist/cli.js");
export async function connectMcp(env: Record<string, string>, args: string[] = []) {
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [cliPath, ...args],
    env: { PATH: process.env["PATH"] ?? "", ...env },
    stderr: "pipe",
  });
  const client = new Client({ name: "sample-test-client", version: "0.0.0" });
  // Capture diagnostics without printing potentially inherited provider data.
  transport.stderr?.on("data", () => {});
  try {
    await client.connect(transport);
  } catch (error) {
    await transport.close();
    throw error;
  }
  return client;
}
export async function call(client: Client, name: string, args: Record<string, unknown> = {}) {
  const result = await client.callTool({ name, arguments: args }, { timeout: 660_000 });
  const value = result.structuredContent as Record<string, unknown> | undefined;
  if (result.isError)
    throw new Error(`Tool ${name} failed: ${JSON.stringify(value ?? result.content)}`);
  if (!value) throw new Error(`Tool ${name} returned no structuredContent.`);
  return value;
}
