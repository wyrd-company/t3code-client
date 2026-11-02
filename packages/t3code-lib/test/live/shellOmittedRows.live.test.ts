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
import { describe, expect, it } from "vite-plus/test";
import { T3RpcError, type OrchestrationV2ThreadShell, type T3Client } from "../../src/index.ts";
import {
  runId as toRunId,
  threadId,
  type ProjectId,
  type RunId,
} from "../../src/schemas/common.ts";
import { connect, hasAgent, hasLiveServer, modelSelection, waitFor } from "./liveClient.ts";

interface SampleThread {
  readonly name: string;
  readonly title?: string;
  readonly runtimeMode?: "full-access";
}

/** Runs `body` with a new thread in a new project, then removes both and closes the client. */
async function withSampleThread(
  { name, title = name, runtimeMode }: SampleThread,
  body: (
    client: T3Client,
    thread: OrchestrationV2ThreadShell,
    projectId: ProjectId,
  ) => Promise<void>,
): Promise<void> {
  const client = connect();
  const { projectId } = await client.projects.createNew({ name });
  const thread = await client.threads.create({
    projectId,
    title,
    modelSelection,
    ...(runtimeMode === undefined ? {} : { runtimeMode }),
  });
  try {
    await body(client, thread, projectId);
  } finally {
    try {
      await client.threads.delete(thread.id);
      await client.projects.delete(projectId, { force: true });
    } finally {
      await client.close();
    }
  }
}

describe.skipIf(!hasLiveServer)("live shell omitted rows", () => {
  it("reads families, older settled pages and omitted snapshots from a stock server", async () => {
    const title = `Sample omitted ${NodeCrypto.randomUUID()}`;
    const sample = { name: "Sample omitted", title };
    await withSampleThread(sample, async (client, thread, projectId) => {
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
      const projectIds = [projectId];
      const page = await client.shell.olderSettledThreads({ before, projectIds, limit: 50 });
      expect(page.threads.map((row) => row.id)).toEqual([thread.id]);
      const counts = await client.shell.olderSettledThreads({ before, projectIds, limit: 0 });
      expect(counts.threads).toEqual([]);
      expect(counts.counts).toEqual([{ projectId, count: 1 }]);

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
    });
  });

  it("refuses a force stop of a run that is not the latest", async () => {
    await withSampleThread({ name: "Sample refuse" }, async (client, thread) => {
      const refused = await client.threads
        .forceStop(thread.id, { runId: toRunId(NodeCrypto.randomUUID()) })
        .catch((error: unknown) => error);
      expect(refused).toBeInstanceOf(T3RpcError);
      expect(
        refused instanceof T3RpcError &&
          refused.is("OrchestrationV2ForceStopThreadError") &&
          refused.record.reason,
      ).toBe("superseded");
    });
  });

  it.skipIf(!hasAgent)(
    "force stops a real agent turn",
    async () => {
      const sample = { name: "Sample force", runtimeMode: "full-access" } as const;
      await withSampleThread(sample, async (client, thread) => {
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
        const run = await waitFor(running, "the agent to start the sample command", {
          timeoutMs: 180_000,
          intervalMs: 500,
        });
        observation["commandRunningBeforeForceStop"] = true;
        const result = await client.threads.forceStop(thread.id, { runId: run });
        observation["outcome"] = result.outcome;
        observation["sharedWithThreads"] = result.sharedWithThreadIds.length;
        expect(["killed", "released", "releasing"]).toContain(result.outcome);
        const terminal = ["completed", "interrupted", "failed", "cancelled", "rolled_back"];
        const ended = await waitFor(
          async () => {
            const read = await client.threads.get(thread.id);
            return terminal.includes(read?.status ?? "") ? read : undefined;
          },
          "a terminal thread status",
          { timeoutMs: 60_000, intervalMs: 500 },
        );
        observation["activeRunAfter"] = ended?.activeRunId ?? null;
        observation["statusAfter"] = ended?.status;
        expect(terminal).toContain(ended?.status);
        expect(ended?.activeRunId).toBeNull();
        const evidence = process.env["T3_LIVE_FORCE_STOP_EVIDENCE"];
        if (evidence)
          await NodeFSP.writeFile(evidence, `${JSON.stringify(observation, null, 2)}\n`);
      });
    },
    240_000,
  );
});
