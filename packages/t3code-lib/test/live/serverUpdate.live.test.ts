// ---
// relationships:
//   verifies: library
// ---
/**
 * The self update and tunnel client methods of real servers. No test server has a service
 * launcher or a desktop app, so each update request stops at its refusal and nothing moves.
 */
import * as NodeFSP from "node:fs/promises";
import * as NodePath from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vite-plus/test";
import { WebSocket as WsWebSocket } from "ws";
import { T3Client, type T3RpcError, memoryCredentialStore } from "../../src/index.ts";
import type { WebSocketConstructor } from "../../src/internal/websocket.ts";
import { startDesktopServer } from "./desktopServer.ts";
import { hasLiveServer, refusal } from "./liveClient.ts";
import { type PeerServer, startScratchServer, withScopes } from "./peerServer.ts";

const UPDATE = { targetVersion: "0.1.8" };
const webSocket = WsWebSocket as unknown as WebSocketConstructor;

/** What a stream sends before it ends, and the failure or decode error that ends it. */
const collect = async <T>(
  items: AsyncIterable<
    | { readonly kind: "item"; readonly value: T }
    | { readonly kind: "decode-error"; readonly error: Error }
  >,
) => {
  const seen: T[] = [];
  try {
    for await (const item of items) {
      if (item.kind === "decode-error") return { seen, failure: item.error };
      seen.push(item.value);
    }
    return { seen, failure: undefined };
  } catch (failure) {
    return { seen, failure };
  }
};

describe.skipIf(!hasLiveServer)("live server update", () => {
  let server: PeerServer;
  beforeAll(async () => {
    server = await startScratchServer("t3code-lib-update-");
  });
  afterAll(async () => {
    await server.stop();
  });

  it("refuses an update on a server with no service launcher", async () => {
    const { rpc } = server.client;
    expect(await refusal(rpc.call("server.updateServer", UPDATE))).toMatchObject({
      _tag: "ServerSelfUpdateError",
      reason: expect.stringContaining("background service"),
    });

    const streamed = await collect(rpc.stream("server.updateServerWithProgress", UPDATE));
    expect(streamed.seen).toEqual([]);
    expect((streamed.failure as T3RpcError).is("ServerSelfUpdateError")).toBe(true);
  });

  it("refuses to commit a desktop update on a server with no desktop app", async () => {
    expect(
      await refusal(
        server.client.rpc.call("server.commitDesktopUpdate", { requestId: "sample-request" }),
      ),
    ).toMatchObject({ _tag: "ServerSelfUpdateError" });
  });

  it("refuses both on a desktop server with no desktop app", async () => {
    const desktop = await startDesktopServer({ desktopBootstrapToken: "sample-seed-token" });
    const client = T3Client.create({
      baseUrl: desktop.baseUrl,
      webSocket,
      credentials: memoryCredentialStore(),
    });
    try {
      await client.auth.exchangePairingToken("sample-seed-token");
      expect(await refusal(client.rpc.call("server.updateServer", UPDATE))).toMatchObject({
        _tag: "ServerSelfUpdateError",
        reason: expect.stringContaining("desktop app"),
      });
      expect(
        await refusal(client.rpc.call("server.commitDesktopUpdate", { requestId: "sample" })),
      ).toMatchObject({ _tag: "ServerSelfUpdateError" });
    } finally {
      await client.close();
      await desktop.stop();
    }
  });

  it("needs the maintain scope", async () => {
    await withScopes(server, ["orchestration:read"], async (reader) => {
      await expect(reader.rpc.call("server.updateServer", UPDATE)).rejects.toMatchObject({
        code: "insufficient_scope",
      });
    });
  });
});

describe.skipIf(!hasLiveServer)("live tunnel client", () => {
  const stub = async (home: string) => {
    const path = NodePath.join(home, "sample-tunnel-client");
    await NodeFSP.writeFile(path, '#!/bin/sh\necho "cloudflared version 2099.1.0"\n', {
      mode: 0o755,
    });
    return path;
  };

  it("reports and accepts an override that works", async () => {
    let executablePath = "";
    const server = await startScratchServer("t3code-lib-tunnel-", async (home) => {
      executablePath = await stub(home);
      return { T3CODE_CLOUDFLARED_PATH: executablePath };
    });
    try {
      const { rpc } = server.client;
      const available = { status: "available", executablePath, source: "override" };
      expect(await rpc.call("cloud.getRelayClientStatus", {})).toMatchObject(available);
      const { seen, failure } = await collect(rpc.stream("cloud.installRelayClient", {}));
      expect(failure).toBeUndefined();
      expect(seen[0]).toEqual({ type: "progress", stage: "checking" });
      expect(seen.at(-1)).toMatchObject({ type: "complete", status: available });
      await withScopes(server, ["relay:read"], async (reader) => {
        expect(await reader.rpc.call("cloud.getRelayClientStatus", {})).toMatchObject(available);
        const refused = await collect(reader.rpc.stream("cloud.installRelayClient", {}));
        expect(refused.failure).toMatchObject({ code: "insufficient_scope" });
      });
    } finally {
      await server.stop();
    }
  });

  it("reports an override that is gone, and refuses to install past it", async () => {
    const server = await startScratchServer("t3code-lib-tunnel-", (home) => ({
      T3CODE_CLOUDFLARED_PATH: NodePath.join(home, "sample-missing"),
    }));
    try {
      const { rpc } = server.client;
      expect(await rpc.call("cloud.getRelayClientStatus", {})).toMatchObject({
        status: "missing",
      });
      const { failure } = await collect(rpc.stream("cloud.installRelayClient", {}));
      expect((failure as T3RpcError).is("RelayClientInstallFailedError")).toBe(true);
      expect((failure as T3RpcError).detail).toMatchObject({ reason: "override_missing" });
    } finally {
      await server.stop();
    }
  });

  it("downloads the client into the server's home, or reports the typed failure", async () => {
    const server = await startScratchServer("t3code-lib-tunnel-");
    try {
      const { rpc } = server.client;
      const { seen, failure } = await collect(rpc.stream("cloud.installRelayClient", {}));
      if (failure !== undefined) {
        expect((failure as T3RpcError).detail).toMatchObject({ reason: "download_failed" });
        return;
      }
      expect(seen.slice(0, -1).map((event) => ("stage" in event ? event.stage : event))).toEqual(
        expect.arrayContaining([
          "checking",
          "downloading",
          "verifying",
          "installing",
          "validating",
          "activating",
        ]),
      );
      expect(seen.at(-1)).toMatchObject({
        type: "complete",
        status: { status: "available", source: "managed" },
      });
      expect(await rpc.call("cloud.getRelayClientStatus", {})).toMatchObject({
        status: "available",
        source: "managed",
      });
    } finally {
      await server.stop();
    }
  }, 300_000);
});
