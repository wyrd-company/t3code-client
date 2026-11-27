import * as NodeFSP from "node:fs/promises";
import * as NodePath from "node:path";
import { afterAll, describe, expect, it } from "vite-plus/test";
import { providerInstanceId } from "../../src/index.ts";
import { connect, connectWithScopes, hasLiveServer } from "./liveClient.ts";

const root = process.env["T3_LIVE_WORKSPACE"];

describe.skipIf(!hasLiveServer || !root)("live provider runtime mode limits", () => {
  const owner = connect();
  afterAll(() => owner.close());

  it("reads Claude's Auto restriction from the workspace with a read grant", async () => {
    const cwd = await NodeFSP.mkdtemp(NodePath.join(root ?? "", "sample-claude-"));
    const settings = NodePath.join(cwd, ".claude", "settings.json");
    const reader = await connectWithScopes(owner, ["orchestration:read"]);
    try {
      await NodeFSP.mkdir(NodePath.dirname(settings));
      await NodeFSP.writeFile(settings, JSON.stringify({ disableAutoMode: "disable" }));
      const input = { instanceId: providerInstanceId("claudeAgent"), cwd };
      expect(await reader.server.getProviderRuntimeModeLimits(input)).toMatchObject({
        limits: [{ mode: "auto", reason: "project-settings" }],
      });
      expect(
        await reader.server.getProviderRuntimeModeLimits({
          ...input,
          instanceId: providerInstanceId("sample-missing-provider"),
        }),
      ).toEqual({ limits: [] });
    } finally {
      await reader.close();
      await NodeFSP.rm(cwd, { recursive: true, force: true });
    }
  });
});
