/**
 * Runs against a real T3 Code server, reached through T3_LIVE_URL and
 * T3_LIVE_TOKEN (see globalSetup.ts).
 */
import { WebSocket as WsWebSocket } from "ws";
import { describe, expect, it } from "vite-plus/test";
import { T3RpcDefectError } from "../../src/errors.ts";
import type { WebSocketConstructor } from "../../src/internal/websocket.ts";
import {
  ORCHESTRATION_PROTOCOL_QUERY_PARAM,
  ORCHESTRATION_PROTOCOL_VERSION_TEXT,
} from "../../src/schemas/environment.ts";
import { RpcConnection } from "../../src/transport/rpcConnection.ts";
import { SocketTransport } from "../../src/transport/socket.ts";

const baseUrl = process.env["T3_LIVE_URL"];
const token = process.env["T3_LIVE_TOKEN"];

describe.skipIf(!baseUrl || !token)("live RPC", () => {
  const wsUrl = () => {
    const url = new URL("/ws", baseUrl);
    url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
    url.searchParams.set(ORCHESTRATION_PROTOCOL_QUERY_PARAM, ORCHESTRATION_PROTOCOL_VERSION_TEXT);
    return url;
  };

  it("refuses an upgrade that does not name the orchestration protocol", async () => {
    const url = new URL("/ws", baseUrl);
    url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
    const status = await new Promise<number>((resolve, reject) => {
      const socket = new WsWebSocket(url, { headers: { authorization: `Bearer ${token}` } });
      socket.on("unexpected-response", (_request, response) => {
        resolve(response.statusCode ?? 0);
        socket.terminate();
      });
      socket.on("open", () => {
        socket.close();
        reject(new Error("The upgrade was accepted without a protocol version."));
      });
      socket.on("error", (error) => reject(error));
    });
    expect(status).toBe(426);
  });

  it("server.probe over a bearer header upgrade", async () => {
    const rpc = new RpcConnection(
      new SocketTransport({
        url: async () => wsUrl(),
        headers: async () => ({ authorization: `Bearer ${token}` }),
        webSocket: WsWebSocket as unknown as WebSocketConstructor,
      }),
    );
    try {
      const result = await rpc.call("server.probe", {});
      expect(result).toBeDefined();
      await expect(rpc.call("no.such.method", {})).rejects.toBeInstanceOf(T3RpcDefectError);
    } finally {
      await rpc.close();
    }
  });

  it("server.probe over a ticket upgrade with the global WebSocket", async () => {
    const rpc = new RpcConnection(
      new SocketTransport({
        url: async () => {
          const response = await fetch(new URL("/api/auth/websocket-ticket", baseUrl), {
            method: "POST",
            headers: { authorization: `Bearer ${token}` },
          });
          const { ticket } = (await response.json()) as { ticket: string };
          const url = wsUrl();
          url.searchParams.set("wsTicket", ticket);
          return url;
        },
        webSocket: globalThis.WebSocket as unknown as WebSocketConstructor,
      }),
    );
    try {
      await expect(rpc.call("server.probe", {})).resolves.toBeDefined();
      const events: unknown[] = [];
      for await (const event of rpc.stream("subscribeServerLifecycle", {})) {
        events.push(event);
        break;
      }
    } finally {
      await rpc.close();
    }
  });
});
