// ---
// relationships:
//   verifies: library-facades
// ---
import * as NodeFSP from "node:fs/promises";
import { WebSocket as WsWebSocket, type ClientOptions } from "ws";
import { expect, it } from "vite-plus/test";
import { T3Client } from "../../src/client.ts";
import { ProviderInstanceId } from "../../src/schemas/common.ts";
import type { WebSocketConstructor } from "../../src/internal/websocket.ts";

const ownedHome = process.env["T3_LIVE_HOME"];
const enabled = process.env["T3_LIVE_AGENT"] === "1" && Boolean(ownedHome);

it.skipIf(!enabled)(
  "removes an owned worktree after a completed stock-server subject",
  async () => {
    const record = async (value: Record<string, unknown>) => {
      const line = JSON.stringify(value);
      console.info(line);
      const evidence = process.env["T3_LIVE_VOID_EVIDENCE"];
      if (evidence) await NodeFSP.appendFile(evidence, `${line}\n`);
    };
    const successes: unknown[] = [];
    class RecordingSocket extends WsWebSocket {
      constructor(url: string, options?: ClientOptions) {
        super(url, options);
        this.on("message", (data) => {
          const frame = JSON.parse(data.toString());
          for (const message of Array.isArray(frame) ? frame : [frame]) {
            if (message._tag === "Exit" && message.exit?._tag === "Success") {
              successes.push(message.exit.value);
            }
          }
        });
      }
    }
    const client = T3Client.create({
      baseUrl: process.env["T3_LIVE_URL"] ?? "",
      accessToken: process.env["T3_LIVE_TOKEN"] ?? "",
      webSocket: RecordingSocket as unknown as WebSocketConstructor,
    });
    let project: Awaited<ReturnType<typeof client.projects.createNew>> | undefined;
    let thread: Awaited<ReturnType<typeof client.threads.create>> | undefined;
    let worktreePath: string | undefined;
    try {
      const descriptor = await client.auth.descriptor();
      expect(descriptor).toMatchObject({ serverVersion: "0.1.0", orchestrationProtocolVersion: 2 });
      project = await client.projects.createNew({ name: "Sample cleanup" });
      const status = await client.vcs.status({ cwd: project.workspaceRoot });
      const created = await client.vcs.createWorktree({
        cwd: project.workspaceRoot,
        refName: status.refName ?? "main",
        newRefName: "sample-cleanup",
        path: null,
      });
      worktreePath = created.worktree.path;
      thread = await client.threads.create({
        projectId: project.projectId,
        title: "Sample cleanup",
        modelSelection: { instanceId: ProviderInstanceId.parse("codex"), model: "gpt-6-luna" },
        worktreePath,
        branch: created.worktree.refName,
      });
      const turn = await client.threads.startTurn({
        threadId: thread.id,
        text: "Reply SAMPLE only. Do not use tools or change files.",
      });
      const outcome = await turn.completion;
      expect(outcome.state).toBe("completed");
      await record({
        serverHome: ownedHome,
        projectId: project.projectId,
        threadId: thread.id,
        runId: outcome.runId,
        model: "gpt-6-luna",
        state: outcome.state,
        worktreePath,
      });
      await client.threads.delete(thread.id);
      thread = undefined;
      successes.length = 0;
      const result = await client.vcs.removeWorktree({
        cwd: project.workspaceRoot,
        path: worktreePath,
      });
      expect(result).toBeUndefined();
      expect(successes).toEqual([null]);
      await expect(NodeFSP.stat(worktreePath)).rejects.toMatchObject({ code: "ENOENT" });
      await record({
        method: "vcs.removeWorktree",
        wireSuccess: successes[0],
        facadeResult: "undefined",
        worktreeRemoved: true,
      });
      worktreePath = undefined;
    } finally {
      try {
        if (thread) await client.threads.delete(thread.id);
        if (project && worktreePath) {
          await client.vcs.removeWorktree({
            cwd: project.workspaceRoot,
            path: worktreePath,
            force: true,
          });
        }
        if (project) await client.projects.delete(project.projectId, { force: true });
        await record({ serverHome: ownedHome, ownedThreadAndProjectCleanup: "complete" });
      } finally {
        await client.close();
        await record({ serverHome: ownedHome, clientClosed: true });
      }
    }
  },
);
