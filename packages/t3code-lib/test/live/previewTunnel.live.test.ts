// ---
// relationships:
//   verifies: library-wire
// ---
import * as NodeEvents from "node:events";
import * as NodeNet from "node:net";
import { expect, it } from "vite-plus/test";
import { connect, connectWithScopes, firstItem, hasLiveServer } from "./liveClient.ts";

it.skipIf(!hasLiveServer)(
  "exchanges bytes with a loopback port using terminal:operate",
  async () => {
    const server = NodeNet.createServer((socket) => socket.pipe(socket));
    const listening = NodeEvents.once(server, "listening");
    server.listen(0, "127.0.0.1");
    await listening;
    const address = server.address();
    if (address === null || typeof address === "string")
      throw new Error("Expected a TCP listener.");

    const client = connect();
    try {
      const reader = await connectWithScopes(client, ["orchestration:read"]);
      try {
        await expect(reader.openPreviewTunnel(address.port)).rejects.toMatchObject({
          requiredScope: "terminal:operate",
        });
      } finally {
        await reader.close();
      }

      const tunnel = await client.openPreviewTunnel(address.port, AbortSignal.timeout(5_000));
      try {
        const sent = new TextEncoder().encode("Sample preview data");
        tunnel.send(sent);
        const reply = await firstItem(tunnel, (bytes) => bytes);
        expect([...reply]).toEqual([...sent]);
      } finally {
        await tunnel.close();
      }
    } finally {
      await client.close();
      const closed = NodeEvents.once(server, "close");
      server.close();
      await closed;
    }
  },
);
