// ---
// relationships:
//   implements: library-testing
// ---
/**
 * A scratch server whose guest links work with no relay. A guest route needs a running tunnel
 * client that reports the link's host, so a stub plays that client, and the stopped home gets the
 * records of a tunnel the relay has confirmed.
 */
import * as NodeFSP from "node:fs/promises";
import * as NodePath from "node:path";
import { T3Client } from "../../src/index.ts";
import { type PeerServer, startPeerServer } from "./peerServer.ts";

export const TUNNEL_HOST = "tunnel.example.test";
const STUB = NodePath.join(import.meta.dirname, "stubTunnelClient.mjs");

async function findSecrets(home: string): Promise<string> {
  const entries = await NodeFSP.readdir(home, { recursive: true, withFileTypes: true });
  const found = entries.find((entry) => entry.isDirectory() && entry.name === "secrets");
  if (!found) throw new Error("The server home has no secrets folder.");
  return NodePath.join(found.parentPath, found.name);
}

async function confirmTunnel(home: string, port: number): Promise<void> {
  const secrets = await findSecrets(home);
  const config = { providerKind: "cloudflare_tunnel", connectorToken: "sample-connector" };
  const origin = { localHttpHost: "127.0.0.1", localHttpPort: port };
  await NodeFSP.writeFile(
    NodePath.join(secrets, "cloud-endpoint-runtime-config.bin"),
    JSON.stringify(config),
  );
  await NodeFSP.writeFile(
    NodePath.join(secrets, "cloud-endpoint-confirmed-origin.bin"),
    JSON.stringify({ config, origin }),
  );
}

export async function startGuestServer(): Promise<PeerServer> {
  // A peer server keeps the agent's login. The test sends a guest message to the agent.
  const server = await startPeerServer({
    environment: { T3CODE_CLOUDFLARED_PATH: STUB, SAMPLE_TUNNEL_HOST: TUNNEL_HOST },
  });
  try {
    await server.client.rpc.call("server.updateSettings", {
      patch: { guestSharingEnabled: true },
    });
    await server.restart((home) => confirmTunnel(home, Number(new URL(server.baseUrl).port)));
    return server;
  } catch (error) {
    await server.stop();
    throw error;
  }
}

/** A guest's client: its `fetch` keeps each session cookie, and it holds no token. */
export function guestClient(baseUrl: string): T3Client {
  const cookies = new Map<string, string>();
  const keeping = (async (input: URL, init: RequestInit) => {
    const headers = new Headers(init.headers);
    if (cookies.size > 0) headers.set("cookie", [...cookies.values()].join("; "));
    const response = await fetch(input, { ...init, headers });
    for (const value of response.headers.getSetCookie()) {
      const pair = value.split(";")[0] ?? "";
      cookies.set(pair.split("=")[0] ?? "", pair);
    }
    return response;
  }) as typeof fetch;
  return T3Client.create({ baseUrl, fetch: keeping });
}
