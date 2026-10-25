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

describe.skipIf(!baseUrl || !token)("live workspace slash-command discovery state", () => {
  it("reads stock workspace snapshots through the public facade", async () => {
    const client = T3Client.create({
      baseUrl: baseUrl ?? "",
      accessToken: token ?? "",
      webSocket: WsWebSocket as unknown as WebSocketConstructor,
    });
    try {
      const providers = await client.server.providers();
      expect(providers.length).toBeGreaterThan(0);
      const counts = { snapshots: 0, absent: 0, pending: 0, complete: 0 };
      for (const provider of providers) {
        for (const snapshot of provider.workspaceSnapshots ?? []) {
          counts.snapshots++;
          const pending: boolean | undefined = snapshot.slashCommandsPending;
          if (pending === undefined) counts.absent++;
          else {
            expect(typeof pending).toBe("boolean");
            if (pending) counts.pending++;
            else counts.complete++;
          }
        }
      }
      console.log("Workspace slash-command discovery counts", counts);
    } finally {
      await client.close();
    }
  });
});
