// ---
// relationships:
//   verifies: library-facades
// ---
/**
 * Real server promotion of a No project thread into a project, the refusal for a thread outside
 * Scratch, project pinning and archiving, and the refusal of the internal adopt-folder command.
 */
import * as NodeCrypto from "node:crypto";
import { describe, expect, it } from "vite-plus/test";
import { threadId, type ProjectId } from "../../src/schemas/common.ts";
import { connect, hasLiveServer, modelSelection } from "./liveClient.ts";

describe.skipIf(!hasLiveServer)("live project from thread", () => {
  it("turns a No project thread into a project in place, and repeats safely", async () => {
    const client = connect();
    const created: ProjectId[] = [];
    const threads: string[] = [];
    try {
      const config = await client.server.getConfig();
      expect(config.environment.capabilities.threadProjectFromScratch).toBe(true);
      const scratch = await client.projects.ensureScratch();
      const title = `Sample promotion ${NodeCrypto.randomUUID()}`;
      const launched = await client.threads.launch({
        projectId: scratch.projectId,
        title,
        modelSelection,
        workspace: { type: "root" },
      });
      threads.push(launched.threadId);
      const before = await client.threads.get(threadId(launched.threadId));
      const folder = before?.worktreePath;
      expect(typeof folder).toBe("string");

      const promoted = await client.projects.createFromThread({
        threadId: threadId(launched.threadId),
      });
      created.push(promoted.projectId);
      expect(promoted.projectId).not.toBe(scratch.projectId);
      const project = await client.projects.get(promoted.projectId);
      expect(project).toMatchObject({ title, workspaceRoot: folder });
      const after = await client.threads.get(threadId(launched.threadId));
      expect(after).toMatchObject({ projectId: promoted.projectId, worktreePath: null });

      await expect(
        client.projects.createFromThread({ threadId: threadId(launched.threadId) }),
      ).resolves.toEqual({ projectId: promoted.projectId });
    } finally {
      for (const id of threads) await client.threads.delete(threadId(id)).catch(() => undefined);
      for (const id of created)
        await client.projects.delete(id, { force: true }).catch(() => undefined);
      await client.close();
    }
  });

  it("refuses a thread outside Scratch and an unknown thread", async () => {
    const client = connect();
    const project = await client.projects.createNew({ name: "Sample refusal" });
    try {
      const thread = await client.threads.create({
        projectId: project.projectId,
        title: "Sample refusal",
        modelSelection,
      });
      for (const id of [thread.id, threadId(NodeCrypto.randomUUID())]) {
        await expect(client.projects.createFromThread({ threadId: id })).rejects.toMatchObject({
          code: "rpc_failed",
          tag: "OrchestrationDispatchCommandError",
        });
      }
    } finally {
      await client.projects.delete(project.projectId, { force: true });
      await client.close();
    }
  });

  it("pins and archives a project, and clears both", async () => {
    const client = connect();
    const { projectId } = await client.projects.createNew({ name: "Sample organize" });
    try {
      const config = await client.server.getConfig();
      expect(config.environment.capabilities.projectOrganization).toBe(true);
      const set = await client.projects.update(projectId, { pinned: true, archived: true });
      expect(typeof set.pinnedAt).toBe("string");
      expect(typeof set.archivedAt).toBe("string");
      const summary = await client.projects.get(projectId);
      expect(summary).toMatchObject({ pinnedAt: set.pinnedAt, archivedAt: set.archivedAt });
      const records = await client.projects.snapshot();
      expect(records.projects.find((row) => row.id === projectId)).toMatchObject({
        pinnedAt: set.pinnedAt,
        archivedAt: set.archivedAt,
      });
      const cleared = await client.projects.update(projectId, { pinned: false, archived: false });
      expect(cleared.pinnedAt ?? null).toBeNull();
      expect(cleared.archivedAt ?? null).toBeNull();
    } finally {
      await client.projects.delete(projectId, { force: true });
      await client.close();
    }
  });

  it("does not accept the internal adopt-folder command from a client", async () => {
    const client = connect();
    const { projectId } = await client.projects.createNew({ name: "Sample adopt" });
    try {
      const thread = await client.threads.create({
        projectId,
        title: "Sample adopt",
        modelSelection,
      });
      await expect(
        client.rpc.callRaw("orchestration.dispatchCommand", {
          type: "thread.project.adopt-folder",
          commandId: client.threads.dispatcher.newCommandId(),
          threadId: thread.id,
          projectId,
        }),
      ).rejects.toMatchObject({ code: "rpc_defect", method: "orchestration.dispatchCommand" });
    } finally {
      await client.projects.delete(projectId, { force: true });
      await client.close();
    }
  });
});
