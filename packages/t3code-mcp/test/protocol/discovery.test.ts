// ---
// relationships:
//   verifies: mcp
// ---
import { spawn } from "node:child_process";
import { createInterface } from "node:readline";
import {
  CLIENT_CAPABILITIES_META_KEY,
  CLIENT_INFO_META_KEY,
  PROTOCOL_VERSION_META_KEY,
} from "@modelcontextprotocol/server";
import { expect, it } from "vite-plus/test";

it("keeps the actual upstream client usable after discovery falls back to initialize", async () => {
  const server = spawn(process.execPath, ["test/protocol/fixtures/discoveryServer.mjs"], {
    stdio: ["pipe", "pipe", "pipe"],
  });
  const exited = new Promise((resolve) => server.once("exit", (code) => resolve(code)));
  const lines = createInterface({ input: server.stdout })[Symbol.asyncIterator]();
  async function request(id: number, method: string, params: object) {
    server.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", id, method, params })}\n`);
    for (;;) {
      const row = await lines.next();
      if (row.done) throw new Error("Server closed before responding.");
      const message = JSON.parse(row.value) as { id: number; result?: unknown; error?: unknown };
      if (message.id === id) return message;
    }
  }
  try {
    const discovery = await request(1, "server/discover", {
      _meta: {
        [PROTOCOL_VERSION_META_KEY]: "2026-07-28",
        [CLIENT_INFO_META_KEY]: { name: "sample-probe", version: "1.0.0" },
        [CLIENT_CAPABILITIES_META_KEY]: {},
      },
    });
    expect(discovery.error).toBeUndefined();
    expect(discovery.result).toMatchObject({ supportedVersions: ["2026-07-28"] });
    const initialized = await request(2, "initialize", {
      protocolVersion: "2025-11-25",
      capabilities: {},
      clientInfo: { name: "sample-fallback", version: "1.0.0" },
    });
    expect(initialized.error).toBeUndefined();
    server.stdin.write(
      `${JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" })}\n`,
    );
    const result = await request(3, "tools/call", { name: "provider_status", arguments: {} });
    expect(result.error).toBeUndefined();
    expect(result.result).toMatchObject({ structuredContent: { providers: [] } });
    expect(result.result).not.toMatchObject({ isError: true });
    server.stdin.end();
    expect(await exited).toBe(0);
  } finally {
    server.kill("SIGTERM");
    await exited;
  }
});
