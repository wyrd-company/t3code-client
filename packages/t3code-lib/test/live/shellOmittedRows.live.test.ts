// ---
// relationships:
//   verifies: library-wire
// ---
/**
 * Real server reads of the rows a shell can leave out, thread search filters and the refusal paths
 * of force stop. T3_LIVE_AGENT=1 also force stops a real agent turn.
 */
import * as NodeCrypto from "node:crypto";
import * as NodeFSP from "node:fs/promises";
import { WebSocket as WsWebSocket } from "ws";
import { describe, expect, it } from "vite-plus/test";
import { T3Client, T3RpcError } from "../../src/index.ts";
import type { WebSocketConstructor } from "../../src/internal/websocket.ts";
import {
  ProviderInstanceId,
  runId as toRunId,
  threadId,
  type RunId,
} from "../../src/schemas/common.ts";

const baseUrl = process.env["T3_LIVE_URL"];
const token = process.env["T3_LIVE_TOKEN"];
const agent = process.env["T3_LIVE_AGENT"] === "1";
const modelSelection = { instanceId: ProviderInstanceId.parse("codex"), model: "gpt-6-luna" };

const connect = () =>
  T3Client.create({
    baseUrl: baseUrl ?? "",
    accessToken: token ?? "",
    webSocket: WsWebSocket as unknown as WebSocketConstructor,
  });

describe.skipIf(!baseUrl || !token)("live shell omitted rows", () => {
  it("reads families, older settled pages and omitted snapshots from a stock server", async () => {
    const client = connect();
    const title = `Sample omitted ${NodeCrypto.randomUUID()}`;
    const project = await client.projects.createNew({ name: "Sample omitted" });
    const thread = await client.threads.create({
      projectId: project.projectId,
      title,
      modelSelection,
    });
    try {
      const config = await client.server.getConfig();
      expect(config.shellThreadFamilies).toBe(true);
      expect(config.shellOlderSettled).toBe(true);

      const family = await client.shell.threadFamily(thread.id);
      expect(family.threads.map((row) => row.id)).toEqual([thread.id]);
      const unknown = await client.shell.threadFamily(threadId(NodeCrypto.randomUUID()));
      expect(unknown.threads).toEqual([]);
      expect(await client.shell.worktreeThreadIds("/sample/absent/worktree")).toEqual([]);

      await client.threads.settle(thread.id);
      const future = new Date(Date.now() + 3_600_000).toISOString();
      const before = { settledAt: future };
      const projectIds = [project.projectId];
      const page = await client.shell.olderSettledThreads({ before, projectIds, limit: 50 });
      expect(page.threads.map((row) => row.id)).toEqual([thread.id]);
      const counts = await client.shell.olderSettledThreads({ before, projectIds, limit: 0 });
      expect(counts.threads).toEqual([]);
      expect(counts.counts).toEqual([{ projectId: project.projectId, count: 1 }]);

      const omit = { omitIdleSubagents: true, omitOlderSettled: true };
      const full = await client.shell.snapshot();
      expect(full.olderSettled).toBeUndefined();
      const omitted = await client.shell.snapshot(undefined, omit);
      expect(omitted.olderSettled?.asOfSequence).toBe(omitted.snapshotSequence);
      for await (const item of client.shell.watch({
        ...omit,
        signal: AbortSignal.timeout(20_000),
      })) {
        if (item.kind !== "snapshot") continue;
        expect(item.snapshot.olderSettled?.before).toBe(omitted.olderSettled?.before);
        break;
      }

      const found = await client.threads.search({
        query: title,
        olderSettledBefore: future,
        projectIds,
        titlesOnly: true,
      });
      expect(found.threads?.map((row) => row.id)).toEqual([thread.id]);
      expect(typeof found.snapshotSequence).toBe("number");
    } finally {
      try {
        await client.threads.delete(thread.id);
        await client.projects.delete(project.projectId, { force: true });
      } finally {
        await client.close();
      }
    }
  });

  it("refuses a force stop of a run that is not the latest", async () => {
    const client = connect();
    const project = await client.projects.createNew({ name: "Sample refuse" });
    const thread = await client.threads.create({
      projectId: project.projectId,
      title: "Sample refuse",
      modelSelection,
    });
    try {
      const refused = await client.threads
        .forceStop(thread.id, { runId: toRunId(NodeCrypto.randomUUID()) })
        .catch((error: unknown) => error);
      expect(refused).toBeInstanceOf(T3RpcError);
      expect(
        refused instanceof T3RpcError &&
          refused.is("OrchestrationV2ForceStopThreadError") &&
          refused.record.reason,
      ).toBe("superseded");
    } finally {
      try {
        await client.threads.delete(thread.id);
        await client.projects.delete(project.projectId, { force: true });
      } finally {
        await client.close();
      }
    }
  });

  it.skipIf(!agent)(
    "force stops a real agent turn",
    async () => {
      const client = connect();
      const project = await client.projects.createNew({ name: "Sample force" });
      const thread = await client.threads.create({
        projectId: project.projectId,
        title: "Sample force",
        modelSelection,
        runtimeMode: "full-access",
      });
      try {
        await client.threads.startTurn({
          threadId: thread.id,
          text: "Run the shell command `sleep 600` now and wait for it. Do nothing else.",
        });
        // Literals and booleans only; no ids, sequences or server text.
        const observation: Record<string, unknown> = {};
        const running = async (): Promise<RunId | undefined> => {
          const projection = await client.threads.projection(thread.id);
          const command = projection.turnItems.some(
            (item) => item.type === "command_execution" && item.status === "running",
          );
          return command ? (projection.runs.at(-1)?.id ?? undefined) : undefined;
        };
        const started = Date.now() + 180_000;
        let run = await running();
        while (run === undefined && Date.now() < started) {
          await new Promise((resolve) => setTimeout(resolve, 500));
          run = await running();
        }
        if (run === undefined) throw new Error("The agent did not start the sample command.");
        observation["commandRunningBeforeForceStop"] = true;
        const result = await client.threads.forceStop(thread.id, { runId: run });
        observation["outcome"] = result.outcome;
        observation["sharedWithThreads"] = result.sharedWithThreadIds.length;
        expect(["killed", "released", "releasing"]).toContain(result.outcome);
        const deadline = Date.now() + 60_000;
        let ended = await client.threads.get(thread.id);
        while (ended?.activeRunId && Date.now() < deadline) {
          await new Promise((resolve) => setTimeout(resolve, 500));
          ended = await client.threads.get(thread.id);
        }
        observation["activeRunAfter"] = ended?.activeRunId ?? null;
        observation["statusAfter"] = ended?.status;
        expect(ended?.activeRunId).toBeNull();
        const evidence = process.env["T3_LIVE_FORCE_STOP_EVIDENCE"];
        if (evidence)
          await NodeFSP.writeFile(evidence, `${JSON.stringify(observation, null, 2)}\n`);
      } finally {
        try {
          await client.threads.delete(thread.id);
          await client.projects.delete(project.projectId, { force: true });
        } finally {
          await client.close();
        }
      }
    },
    240_000,
  );
});
