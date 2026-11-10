// ---
// relationships:
//   verifies: mcp
// ---
import { Client } from "@modelcontextprotocol/client";
import { InMemoryTransport } from "@modelcontextprotocol/server";
import { T3Client } from "@wyrd-company/t3code-lib";
import { vi } from "vite-plus/test";
import { createServer } from "../../src/server.ts";

const cleanup: (() => Promise<void>)[] = [];

/**
 * An SDK client connected in memory to the MCP server. The connection provider
 * returns an unreachable library client, so tests spy on its methods.
 */
export async function protocolFixture() {
  const upstream = T3Client.create({ baseUrl: "http://127.0.0.1:1" });
  const provider = {
    get: vi.fn().mockResolvedValue(upstream),
    close: vi.fn().mockResolvedValue(undefined),
  };
  const server = createServer(provider);
  const client = new Client({ name: "sample-client", version: "1.0.0" });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await Promise.all([client.connect(clientTransport), server.connect(serverTransport)]);
  cleanup.push(
    () => server.close(),
    () => client.close(),
  );
  return { client, upstream, provider };
}

/** Closes every fixture in reverse order and restores mocks. Register with `afterEach`. */
export async function closeProtocolFixtures(): Promise<void> {
  for (const close of cleanup.splice(0).toReversed()) await close();
  vi.restoreAllMocks();
}
