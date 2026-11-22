// ---
// relationships:
//   verifies: library-auth
// ---
import { expect, it } from "vite-plus/test";
import { T3Client, generateDpopKey } from "../../src/index.ts";
import { connect, hasLiveServer } from "./liveClient.ts";

it.skipIf(!hasLiveServer)(
  "renews a DPoP pairing session and uses the replacement token",
  async () => {
    const owner = connect();
    const paired = T3Client.create({ baseUrl: process.env["T3_LIVE_URL"] ?? "" });
    try {
      const { credential } = await owner.auth.createPairingCredential({
        scopes: ["orchestration:read"],
      });
      const dpopKey = await generateDpopKey();
      const initial = await paired.auth.exchangePairingToken(credential, { dpopKey });
      const [renewed, sameRenewal] = await Promise.all([
        paired.auth.renewAccessToken(),
        paired.auth.renewAccessToken(),
      ]);

      expect(renewed).toEqual(sameRenewal);
      expect(renewed.token_type).toBe("DPoP");
      expect(renewed.access_token === initial.access_token).toBe(false);
      expect((await paired.auth.currentAccessToken()) === renewed.access_token).toBe(true);
      expect(await paired.auth.sessionState()).toMatchObject({
        authenticated: true,
        sessionMethod: "dpop-access-token",
      });
    } finally {
      await paired.close();
      await owner.close();
    }
  },
);
