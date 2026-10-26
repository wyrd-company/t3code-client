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
import { ProviderInstanceId, threadId, type ThreadId } from "../../src/schemas/common.ts";
import type { ThreadStopCommand } from "../../src/schemas/orchestration/commands.ts";

const baseUrl = process.env["T3_LIVE_URL"];
const token = process.env["T3_LIVE_TOKEN"];

describe.skipIf(!baseUrl || !token)("live public thread.stop command", () => {
  it("dispatches typed thread.stop on an idle stock thread and types a missing thread", async () => {
    // Literals, booleans and counts only; no ids, sequences or server text.
    const observation: Record<string, unknown> = {};
    const record = async () => {
      const evidence = process.env["T3_LIVE_THREAD_STOP_EVIDENCE"];
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
      const config = await client.server.getConfig();
      expect(config.environment.capabilities.threadStop).toBe(true);
      project = await client.projects.createNew({ name: "Sample stop" });
      const thread = await client.threads.create({
        projectId: project.projectId,
        title: "Sample stop",
        modelSelection: { instanceId: ProviderInstanceId.parse("codex"), model: "gpt-6-luna" },
      });
      id = thread.id;
      const stop = (target: ThreadId, reason?: string): ThreadStopCommand => ({
        type: "thread.stop",
        commandId: client.threads.dispatcher.newCommandId(),
        threadId: target,
        ...(reason === undefined ? {} : { reason }),
      });
      const receipts = [
        await client.threads.dispatch(stop(id)),
        await client.threads.dispatch(stop(id, "Sample reason")),
        await client.rpc.call("orchestration.dispatchCommand", stop(id)),
        await client.rpc.call("orchestration.dispatchCommand", stop(id, "Sample reason")),
      ];
      observation["typedReceipts"] = receipts.map((receipt) => typeof receipt.sequence);
      expect(observation["typedReceipts"]).toEqual(["number", "number", "number", "number"]);
      const projection = await client.threads.projection(id);
      observation["runsAfter"] = projection.runs.length;
      expect(projection.runs).toEqual([]);

      const missing = threadId(NodeCrypto.randomUUID());
      const failures = [];
      for (const attempt of [
        () => client.threads.dispatch(stop(missing)),
        () => client.rpc.call("orchestration.dispatchCommand", stop(missing, "Sample reason")),
      ]) {
        const error = await attempt().catch((caught: unknown) => caught);
        failures.push({
          class: error instanceof T3RpcError ? "T3RpcError" : typeof error,
          tag: error instanceof T3RpcError ? error.tag : undefined,
          recognised:
            error instanceof T3RpcError && error.is("OrchestrationV2DispatchCommandError"),
        });
      }
      observation["missingThread"] = failures;
      expect(failures).toEqual([
        { class: "T3RpcError", tag: "OrchestrationV2DispatchCommandError", recognised: true },
        { class: "T3RpcError", tag: "OrchestrationV2DispatchCommandError", recognised: true },
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
