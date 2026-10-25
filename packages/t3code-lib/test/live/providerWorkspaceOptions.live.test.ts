// ---
// relationships:
//   verifies: library-facades
// ---
import { WebSocket as WsWebSocket } from "ws";
import { describe, expect, it } from "vite-plus/test";
import { T3Client } from "../../src/index.ts";
import type { WebSocketConstructor } from "../../src/internal/websocket.ts";
import type { ProviderOptionDescriptor } from "../../src/schemas/provider.ts";

const baseUrl = process.env["T3_LIVE_URL"];
const token = process.env["T3_LIVE_TOKEN"];

describe.skipIf(!baseUrl || !token)("live provider workspace options", () => {
  it("reads stock workspace snapshots through the public facade", async () => {
    const client = T3Client.create({
      baseUrl: baseUrl ?? "",
      accessToken: token ?? "",
      webSocket: WsWebSocket as unknown as WebSocketConstructor,
    });
    try {
      const providers = await client.server.providers();
      expect(providers.length).toBeGreaterThan(0);
      const counts = { snapshots: 0, absent: 0, present: 0 };
      for (const provider of providers) {
        for (const snapshot of provider.workspaceSnapshots ?? []) {
          counts.snapshots++;
          const descriptors: ProviderOptionDescriptor[] | undefined = snapshot.optionDescriptors;
          if (descriptors === undefined) counts.absent++;
          else {
            expect(Array.isArray(descriptors)).toBe(true);
            counts.present++;
          }
        }
      }
      console.log("Workspace option snapshot counts", counts);
    } finally {
      await client.close();
    }
  });
});
