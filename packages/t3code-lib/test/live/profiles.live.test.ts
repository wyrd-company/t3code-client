// ---
// relationships:
//   verifies: profiles
// ---
import * as NodeFSP from "node:fs/promises";
import * as NodeOS from "node:os";
import * as NodePath from "node:path";
import { expect, it } from "vite-plus/test";
import { ProfileManager, T3Client, providerInstanceId } from "../../src/index.ts";

it("composes profiles, issued-token import, pairing and resolved auth against the pinned server", async () => {
  const directory = await NodeFSP.mkdtemp(
    NodePath.join(NodeOS.tmpdir(), "t3c-1293-profiles-live-"),
  );
  const url = process.env["T3_LIVE_URL"]!;
  const token = process.env["T3_LIVE_TOKEN"]!;
  const suppliedUrl = `${url}/sample?sample=value#sample`;
  const profiles = new ProfileManager({ configDir: directory });
  const issuer = T3Client.create({ baseUrl: url, accessToken: token });
  try {
    await profiles.setAccessToken({ name: "issued", url: suppliedUrl }, token);
    const credential = await issuer.auth.createPairingCredential({
      label: "sample-profile",
      scopes: ["orchestration:read", "orchestration:operate"],
    });
    await profiles.pair({ name: "paired", url: suppliedUrl }, credential.credential);
    expect(await profiles.getCurrent()).toEqual({ name: "issued", url });
    await profiles.switch("paired");
    const client = T3Client.create(await profiles.resolve({ env: {} }));
    try {
      expect((await client.auth.sessionState()).authenticated).toBe(true);
      expect(await client.auth.hasScope("orchestration:read")).toBe(true);
      expect((await client.auth.descriptor()).serverVersion).toBe("0.1.0");
      await client.shell.snapshot();
      if (process.env["T3_LIVE_AGENT"] === "1") {
        const { projectId } = await client.projects.ensureScratch();
        const thread = await client.threads.create({
          projectId,
          title: "Sample profile authentication check",
          modelSelection: { instanceId: providerInstanceId("codex"), model: "gpt-6-luna" },
        });
        try {
          const turn = await client.threads.startTurn({
            threadId: thread.id,
            text: "Reply with SAMPLE only.",
          });
          const outcome = await turn.completion;
          expect(outcome.state).toBe("completed");
          expect(outcome.assistantMessage?.text).toContain("SAMPLE");
        } finally {
          await client.threads.delete(thread.id);
        }
      }
      await expect(client.auth.ensureScopes(["access:write"])).rejects.toMatchObject({
        code: "insufficient_scope",
      });
    } finally {
      await client.close();
    }
    await profiles.logout();
    expect(await profiles.getCurrent()).toBeUndefined();
    expect((await profiles.list()).map((profile) => profile.name)).toEqual(["issued"]);
  } finally {
    await issuer.close();
    await NodeFSP.rm(directory, { recursive: true, force: true });
  }
});
