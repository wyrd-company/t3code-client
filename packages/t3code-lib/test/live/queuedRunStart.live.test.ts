// ---
// relationships:
//   verifies: library-wire
// ---
import * as NodeCrypto from "node:crypto";
import * as NodeFSP from "node:fs/promises";
import { WebSocket as WsWebSocket } from "ws";
import { describe, expect, it } from "vite-plus/test";
import { T3Client, T3RpcError } from "../../src/index.ts";
import type { WebSocketConstructor } from "../../src/internal/websocket.ts";
import { ProviderInstanceId, runId, threadId, type ThreadId } from "../../src/schemas/common.ts";
import type { QueuedRunStartCommand } from "../../src/schemas/orchestration/commands.ts";

const baseUrl = process.env["T3_LIVE_URL"];
const token = process.env["T3_LIVE_TOKEN"];
/** The pinned server's run-selection rejection for a run that is not a startable queued run. */
const QUEUED_RUN_REJECTION =
  "A queued user message can only be sent now while the thread is stopped.";

describe.skipIf(!baseUrl || !token)("live public queued-run.start command", () => {
  it("dispatches typed queued-run.start to the stock run-selection error without provider work", async () => {
    // Literals, booleans and counts only; no ids, sequences or server text.
    const observation: Record<string, unknown> = {};
    const record = async () => {
      const evidence = process.env["T3_LIVE_QUEUED_RUN_START_EVIDENCE"];
      if (evidence) await NodeFSP.writeFile(evidence, `${JSON.stringify(observation, null, 2)}\n`);
    };
    const client = T3Client.create({
      baseUrl: baseUrl ?? "",
      accessToken: token ?? "",
      webSocket: WsWebSocket as unknown as WebSocketConstructor,
    });
    let project: Awaited<ReturnType<typeof client.projects.createNew>> | undefined;
    let id: ThreadId | undefined;
    try {
      project = await client.projects.createNew({ name: "Sample queue" });
      const thread = await client.threads.create({
        projectId: project.projectId,
        title: "Sample queue",
        modelSelection: { instanceId: ProviderInstanceId.parse("codex"), model: "gpt-6-luna" },
      });
      id = thread.id;
      const start = (target: ThreadId): QueuedRunStartCommand => ({
        type: "queued-run.start",
        commandId: client.threads.dispatcher.newCommandId(),
        threadId: target,
        runId: runId(NodeCrypto.randomUUID()),
      });
      const failures = async (target: ThreadId) => {
        const rows = [];
        for (const attempt of [
          () => client.threads.dispatch(start(target)),
          () => client.rpc.call("orchestration.dispatchCommand", start(target)),
        ]) {
          const error = await attempt().catch((caught: unknown) => caught);
          const recognised =
            error instanceof T3RpcError && error.is("OrchestrationV2DispatchCommandError");
          rows.push({
            class: error instanceof T3RpcError ? "T3RpcError" : typeof error,
            tag: error instanceof T3RpcError ? error.tag : undefined,
            recognised,
            commandType: recognised ? error.record.commandType : undefined,
            runSelectionRejection: recognised && error.record.message === QUEUED_RUN_REJECTION,
          });
        }
        return rows;
      };
      const rejected = {
        class: "T3RpcError",
        tag: "OrchestrationV2DispatchCommandError",
        recognised: true,
        commandType: "queued-run.start",
      };

      observation["nonexistentRun"] = await failures(id);
      expect(observation["nonexistentRun"]).toEqual([
        { ...rejected, runSelectionRejection: true },
        { ...rejected, runSelectionRejection: true },
      ]);
      const projection = await client.threads.projection(id);
      observation["after"] = {
        runs: projection.runs.length,
        providerThreads: projection.providerThreads.length,
        messages: projection.messages.length,
        status: (await client.threads.get(id))?.status,
      };
      expect(observation["after"]).toEqual({
        runs: 0,
        providerThreads: 0,
        messages: 0,
        status: "idle",
      });

      observation["missingThread"] = await failures(threadId(NodeCrypto.randomUUID()));
      expect(observation["missingThread"]).toEqual([
        { ...rejected, runSelectionRejection: false },
        { ...rejected, runSelectionRejection: false },
      ]);
    } finally {
      try {
        if (id) await client.threads.delete(id);
        if (project) await client.projects.delete(project.projectId, { force: true });
        observation["ownedCleanup"] = "complete";
      } finally {
        await client.close();
        await record();
      }
    }
  });
});
