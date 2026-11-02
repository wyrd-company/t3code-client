// ---
// relationships:
//   verifies: library
// ---
/**
 * Source-control sign-in and repository access have no typed facade, and stay reachable through
 * `rpc.callRaw`. A provider kind with no driver keeps the server away from any forge.
 */
import { describe, expect, it } from "vite-plus/test";
import { connect, hasLiveServer, refusal } from "./liveClient.ts";

const signIn = { provider: "example-forge", host: "forge.example.test" };
const access = { ...signIn, repository: "example/repository" };

describe.skipIf(!hasLiveServer)("live raw source-control methods", () => {
  it("reads repository access for a provider with no driver", async () => {
    const client = connect();
    try {
      await expect(client.rpc.callRaw("sourceControl.appAccess", access)).resolves.toEqual({
        status: "signed-out",
      });
      await expect(client.rpc.callRaw("sourceControl.starred", access)).resolves.toBe(false);
    } finally {
      await client.close();
    }
  });

  it.each(["signInStart", "signInWait", "signInCancel"])(
    "refuses %s for a provider with no driver",
    async (method) => {
      const client = connect();
      try {
        const record = await refusal(client.rpc.callRaw(`sourceControl.${method}`, signIn));
        expect(record).toMatchObject({
          unknown: true,
          raw: { _tag: "SourceControlSignInError", ...signIn, reason: "unsupported" },
        });
      } finally {
        await client.close();
      }
    },
  );
});
