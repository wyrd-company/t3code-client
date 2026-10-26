// ---
// relationships:
//   verifies: library-facades
// ---
import { WebSocket as WsWebSocket } from "ws";
import { describe, expect, it } from "vite-plus/test";
import { T3Client } from "../../src/index.ts";
import type { WebSocketConstructor } from "../../src/internal/websocket.ts";

const baseUrl = process.env["T3_LIVE_URL"];
const token = process.env["T3_LIVE_TOKEN"];

describe.skipIf(!baseUrl || !token)("live provider installed version", () => {
  it("reads stock provider metadata through the public facade", async () => {
    const client = T3Client.create({
      baseUrl: baseUrl ?? "",
      accessToken: token ?? "",
      webSocket: WsWebSocket as unknown as WebSocketConstructor,
    });
    try {
      const providers = await client.server.providers();
      expect(providers.length).toBeGreaterThan(0);
      const counts = { absent: 0, unknown: 0, version: 0 };
      for (const provider of providers) {
        const installedVersion: string | null | undefined = provider.installedVersion;
        if (installedVersion === undefined) counts.absent++;
        else if (installedVersion === null) counts.unknown++;
        else {
          expect(typeof installedVersion).toBe("string");
          expect(installedVersion.trim().length).toBeGreaterThan(0);
          expect(installedVersion).toBe(installedVersion.trim());
          counts.version++;
        }
      }
      console.log("Installed provider version metadata counts", counts);
    } finally {
      await client.close();
    }
  });
});
