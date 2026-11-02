// ---
// relationships:
//   verifies: library-facades
// ---
/** Reads whose server method is gone stay available from the stream or result that replaced it. */
import { expect, it } from "vite-plus/test";
import { watchAccess } from "../../src/auth/watchAccess.ts";
import { T3Client } from "../../src/client.ts";

const baseUrl = process.env["T3_LIVE_URL"];
const accessToken = process.env["T3_LIVE_TOKEN"];

it.skipIf(!baseUrl || !accessToken)(
  "reads settings, scheduled tasks and access from their replacements",
  async () => {
    const client = T3Client.create({ baseUrl: baseUrl ?? "", accessToken: accessToken ?? "" });
    try {
      const config = await client.server.getConfig();
      await expect(client.server.getSettings()).resolves.toEqual(config.settings);

      await expect(client.scheduledTasks.list()).resolves.toBeInstanceOf(Array);

      for await (const item of watchAccess(client.rpc)) {
        expect(item).toMatchObject({
          type: "snapshot",
          payload: { pairingLinks: expect.any(Array), clientSessions: expect.any(Array) },
        });
        break;
      }

      const archived = await client.shell.archivedSnapshot();
      expect(archived.threads).toBeInstanceOf(Array);
    } finally {
      await client.close();
    }
  },
);
