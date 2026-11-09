// ---
// relationships:
//   verifies: library-wire
// ---
/**
 * `orchestration.getNativeChildWork` on the stock server. Only an
 * Antigravity-native subagent's child has children to read, and the harness
 * has no Antigravity provider, so a stock thread answers no children.
 */
import * as NodeCrypto from "node:crypto";
import { describe, expect, it } from "vite-plus/test";
import { T3RpcError } from "../../src/index.ts";
import { threadId, type ThreadId } from "../../src/schemas/common.ts";
import { connect, hasLiveServer, modelSelection } from "./liveClient.ts";

describe.skipIf(!hasLiveServer)("live orchestration.getNativeChildWork", () => {
  it("answers no children for a stock thread and types a missing thread", async () => {
    const client = connect();
    let project: Awaited<ReturnType<typeof client.projects.createNew>> | undefined;
    let id: ThreadId | undefined;
    try {
      project = await client.projects.createNew({ name: "Sample native children" });
      const thread = await client.threads.create({
        projectId: project.projectId,
        title: "Sample native children",
        modelSelection,
      });
      id = thread.id;
      await expect(
        client.rpc.call("orchestration.getNativeChildWork", { threadId: id }),
      ).resolves.toEqual({ children: [] });

      const missing = threadId(NodeCrypto.randomUUID());
      const error = await client.rpc
        .call("orchestration.getNativeChildWork", { threadId: missing })
        .catch((caught: unknown) => caught);
      expect(error).toBeInstanceOf(T3RpcError);
      expect((error as T3RpcError).is("OrchestrationV2GetNativeChildWorkError")).toBe(true);
    } finally {
      try {
        if (id) await client.threads.delete(id);
        if (project) await client.projects.delete(project.projectId, { force: true });
      } finally {
        await client.close();
      }
    }
  });
});
