// ---
// relationships:
//   verifies: library-wire
// ---
/**
 * Real server reads of 0.1.8: thread titles, link metadata, prompt suggestions, the branch
 * stream and the settle guard. T3_LIVE_AGENT=1 also runs a fresh context turn.
 */
import * as NodeCP from "node:child_process";
import * as NodeCrypto from "node:crypto";
import * as NodeFSP from "node:fs/promises";
import * as NodeOS from "node:os";
import * as NodePath from "node:path";
import { describe, expect, it } from "vite-plus/test";
import { T3RpcError, type OrchestrationV2ThreadShell, type T3Client } from "../../src/index.ts";
import {
  commandId,
  runId as toRunId,
  threadId as toThreadId,
  type ProjectId,
  type RunId,
} from "../../src/schemas/common.ts";
import { connect, firstItem, hasAgent, hasLiveServer, modelSelection } from "./liveClient.ts";

async function withSampleThread(
  name: string,
  body: (
    client: T3Client,
    thread: OrchestrationV2ThreadShell,
    projectId: ProjectId,
  ) => Promise<void>,
): Promise<void> {
  const client = connect();
  const { projectId } = await client.projects.createNew({ name });
  const thread = await client.threads.create({ projectId, title: name, modelSelection });
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

const settle = (thread: OrchestrationV2ThreadShell, expectedLatestRunId: RunId) => ({
  type: "thread.settle" as const,
  commandId: commandId(NodeCrypto.randomUUID()),
  threadId: thread.id,
  expectedLatestRunId,
});

describe.skipIf(!hasLiveServer)("live thread reads", () => {
  it("reads titles and link metadata of existing threads only", async () => {
    await withSampleThread("Sample titles", async (client, thread, projectId) => {
      expect((await client.server.getConfig()).threadLinkMetadata).toBe(true);
      const threadIds = [thread.id, toThreadId(NodeCrypto.randomUUID())];
      expect(await client.rpc.call("orchestration.getThreadTitles", { threadIds })).toEqual({
        [thread.id]: "Sample titles",
      });
      expect(await client.rpc.call("orchestration.getThreadLinkMetadata", { threadIds })).toEqual({
        [thread.id]: { title: "Sample titles", projectId },
      });
      expect(await client.rpc.call("orchestration.getThreadTitles", { threadIds: [] })).toEqual({});
    });
  });

  it("streams no prompt suggestion for a thread without runs", async () => {
    await withSampleThread("Sample suggestion", async (client, thread) => {
      const stream = client.rpc.stream(
        "orchestration.subscribePromptSuggestion",
        { threadId: thread.id },
        { signal: AbortSignal.timeout(20_000) },
      );
      expect(await firstItem(stream, (value) => ({ value }))).toEqual({ value: null });
    });
  });

  it("refuses a settle when the latest run differs", async () => {
    await withSampleThread("Sample settle", async (client, thread) => {
      const refused = await client.threads
        .dispatch(settle(thread, toRunId(NodeCrypto.randomUUID())))
        .catch((error: unknown) => error);
      expect(refused).toBeInstanceOf(T3RpcError);
      expect(
        refused instanceof T3RpcError && refused.is("OrchestrationV2DispatchCommandError"),
      ).toBe(true);
      const row = (await client.shell.snapshot()).threads.find((entry) => entry.id === thread.id);
      expect(row?.settledAt ?? null).toBeNull();
    });
  });

  it("streams the branch and refreshes it after a switch", async () => {
    const cwd = await NodeFSP.mkdtemp(NodePath.join(NodeOS.tmpdir(), "t3code-branch-"));
    const client = connect();
    const git = (...args: string[]) =>
      NodeCP.execFileSync("git", ["-C", cwd, ...args], { stdio: "pipe" });
    const controller = new AbortController();
    try {
      git("init", "--initial-branch=main");
      git(
        "-c",
        "user.name=Sample",
        "-c",
        "user.email=sample@example.invalid",
        "commit",
        "--allow-empty",
        "-m",
        "Initial",
      );
      const stream = client.rpc.stream(
        "subscribeVcsBranch",
        { cwd },
        { signal: AbortSignal.any([controller.signal, AbortSignal.timeout(30_000)]) },
      );
      const iterator = stream[Symbol.asyncIterator]();
      const next = async () => {
        const result = await iterator.next();
        if (result.done) throw new Error("The branch stream ended.");
        if (result.value.kind === "decode-error") throw result.value.error;
        return result.value.value;
      };
      expect(await next()).toEqual({ refName: "main" });
      git("switch", "--create", "sample");
      await client.rpc.call("vcs.refreshBranch", { cwd });
      expect(await next()).toEqual({ refName: "sample" });
      git("switch", "--detach");
      await client.rpc.call("vcs.refreshBranch", { cwd });
      expect(await next()).toEqual({ refName: null });
      await iterator.return?.();
    } finally {
      controller.abort();
      await client.close();
      await NodeFSP.rm(cwd, { recursive: true, force: true });
    }
  });

  it.skipIf(!hasAgent)(
    "starts a fresh context turn and settles against the latest run",
    async () => {
      await withSampleThread("Sample fresh", async (client, thread) => {
        const first = await client.threads.startTurn({ threadId: thread.id, text: "Say pong." });
        expect((await first.completion).state).toBe("completed");
        const fresh = await client.threads.startTurn({
          threadId: thread.id,
          text: "Say ping.",
          freshContext: true,
        });
        const outcome = await fresh.completion;
        expect(outcome.state).toBe("completed");
        expect(outcome.run.freshContext).toBe(true);
        const projection = await client.threads.projection(thread.id);
        const message = projection.turnItems.find(
          (item) => item.type === "user_message" && item.runId === outcome.runId,
        );
        expect(message).toMatchObject({ type: "user_message", freshContext: true });
        const earlier = projection.runs.find((run) => run.id === first.runId);
        expect(earlier?.freshContext).toBeUndefined();
        // Literals and booleans only; no ids or server text.
        console.info(
          "fresh context observation",
          JSON.stringify({
            providerSessions: projection.providerSessions.length,
            turnModelReported: projection.providerTurns.some((turn) => turn.model !== undefined),
          }),
        );

        await client.threads.dispatch(settle(thread, outcome.runId));
        const row = (await client.shell.snapshot()).threads.find((entry) => entry.id === thread.id);
        expect(row?.settledAt).toEqual(expect.any(String));
      });
    },
    600_000,
  );
});
