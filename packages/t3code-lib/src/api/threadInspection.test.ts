// ---
// relationships:
//   verifies: automation-capabilities
// ---
import { afterEach, beforeEach, expect, it } from "vite-plus/test";
import { FakeT3Server } from "../../test/support/fakeServer.ts";
import {
  at,
  ids,
  items,
  makeProjection,
  makeRun,
  makeRuntimeRequest,
  makeShellSnapshot,
  makeShellThread,
  makeSnapshot,
} from "../../test/support/threadFixtures.ts";
import { T3NotFoundError } from "../errors.ts";
import { RpcClient } from "../rpc/client.ts";
import { rpcMethods } from "../rpc/registry.ts";
import { HttpTransport } from "../transport/http.ts";
import { RpcConnection } from "../transport/rpcConnection.ts";
import { SocketTransport } from "../transport/socket.ts";
import { CommandDispatcher } from "./dispatch.ts";
import { ThreadsApi } from "./threads.ts";

function providerThread(id: string, overrides: Record<string, unknown> = {}) {
  return {
    id,
    driver: "sample-driver",
    providerInstanceId: "sample-provider",
    providerSessionId: null,
    appThreadId: ids.threadId,
    ownerNodeId: null,
    nativeThreadRef: null,
    nativeConversationHeadRef: null,
    status: "idle",
    firstRunOrdinal: 1,
    lastRunOrdinal: 1,
    handoffIds: [],
    forkedFrom: null,
    createdAt: at,
    updatedAt: at,
    ...overrides,
  };
}
function providerTurn(id: string, overrides: Record<string, unknown> = {}) {
  return {
    id,
    providerThreadId: "provider-thread-1",
    nodeId: ids.nodeId,
    runAttemptId: null,
    nativeTurnRef: null,
    ordinal: 1,
    status: "completed",
    startedAt: at,
    completedAt: at,
    ...overrides,
  };
}
const attempt = {
  id: "attempt-1",
  runId: "run-1",
  attemptOrdinal: 1,
  rootNodeId: ids.nodeId,
  providerInstanceId: "sample-provider",
  providerThreadId: "provider-thread-1",
  providerTurnId: "provider-turn-1",
  reason: "initial",
  status: "completed",
  startedAt: at,
  completedAt: at,
};

let server: FakeT3Server;
let connection: RpcConnection;
let threads: ThreadsApi;
function respondDetail(projection: ReturnType<typeof makeProjection>, sequence = 7) {
  server.routes.route(`GET /api/orchestration/threads/${projection.thread.id}`, () => ({
    status: 200,
    body: makeSnapshot(projection, sequence),
  }));
}
function respondShell(threadsInShell: ReturnType<typeof makeShellThread>[]) {
  server.routes.route("GET /api/orchestration/shell", () => ({
    status: 200,
    body: makeShellSnapshot({ threads: threadsInShell }),
  }));
}
beforeEach(async () => {
  server = await FakeT3Server.start();
  connection = new RpcConnection(new SocketTransport({ url: async () => server.wsUrl }));
  const rpc = new RpcClient(connection, rpcMethods);
  threads = new ThreadsApi(
    new HttpTransport({
      baseUrl: server.httpUrl,
      fetch: server.fetch,
      getAccessToken: async () => "token-1",
    }),
    rpc,
    new CommandDispatcher(rpc),
  );
  server.respond("orchestration.getArchivedShellSnapshot", {
    schemaVersion: 2,
    snapshotSequence: 1,
    projects: [],
    threads: [],
  });
});
afterEach(async () => {
  await connection.close();
  await server.close();
});

it("reports a blank thread with no runs, requests or background work", async () => {
  respondDetail(makeProjection());
  respondShell([makeShellThread()]);
  const status = await threads.status(ids.threadId);
  expect(status).toMatchObject({
    snapshotSequence: 7,
    activeRun: null,
    latestRun: null,
    queuedRuns: [],
    queueHeld: false,
    pendingRequests: { approvals: 0, questions: 0 },
    backgroundWork: [],
  });
  expect(status.thread).toMatchObject({ id: ids.threadId, providerInstanceId: "sample-provider" });
});

it("reports active, latest and queued runs, held queues, requests and background work", async () => {
  respondDetail(
    makeProjection({
      runs: [
        makeRun({ id: "run-1", ordinal: 1, status: "completed", completedAt: at }),
        makeRun({ id: "run-2", ordinal: 2, status: "waiting" }),
        makeRun({ id: "run-4", ordinal: 4, status: "queued", queuePosition: 2, startedAt: null }),
        makeRun({
          id: "run-3",
          ordinal: 3,
          status: "queued",
          queuePosition: 1,
          queueHeld: true,
          startedAt: null,
        }),
      ],
      runtimeRequests: [
        makeRuntimeRequest("request-1"),
        makeRuntimeRequest("request-2", { kind: "user_input" }),
        makeRuntimeRequest("request-3", { kind: "user_input" }),
        makeRuntimeRequest("request-4", { status: "resolved", resolvedAt: at }),
      ],
      turnItems: [items.approvalRequest("request-1"), items.userInputRequest("request-2")],
    }),
  );
  const backgroundTask = { taskId: "task-1", kind: "command", description: "Sample task" };
  respondShell([makeShellThread({ pendingBackgroundTasks: [backgroundTask] })]);
  const status = await threads.status(ids.threadId);
  expect(status.activeRun?.id).toBe("run-2");
  expect(status.latestRun?.id).toBe("run-2");
  expect(status.queuedRuns.map((run) => run.id)).toEqual(["run-3", "run-4"]);
  expect(status.queueHeld).toBe(true);
  expect(status.pendingRequests).toEqual({ approvals: 1, questions: 2 });
  expect(status.backgroundWork).toEqual([backgroundTask]);
});

it("reports background work as unavailable when the shell does not list the thread", async () => {
  respondDetail(makeProjection({ runs: [makeRun({ status: "failed", completedAt: at })] }));
  respondShell([]);
  const status = await threads.status(ids.threadId);
  expect(status.backgroundWork).toBeNull();
  expect(status.latestRun?.status).toBe("failed");
  expect(status.activeRun).toBeNull();
});

it("raises not found instead of an empty status or usage", async () => {
  respondShell([]);
  server.routes.route(`GET /api/orchestration/threads/${ids.threadId}`, () => ({
    status: 404,
    body: { _tag: "EnvironmentResourceNotFoundError", reason: "thread_not_found" },
  }));
  await expect(threads.status(ids.threadId)).rejects.toBeInstanceOf(T3NotFoundError);
  await expect(threads.usage(ids.threadId)).rejects.toBeInstanceOf(T3NotFoundError);
});

it("returns provider usage with owners and keeps absent and null usage distinct", async () => {
  const contextUsage = {
    usedTokens: 120,
    maxTokens: 1000,
    cost: { amount: 0.25, currency: "USD" },
  };
  const tokenUsage = { usedTokens: 120, updatedAt: at, futureField: "kept" };
  const turnTokenUsage = {
    usageScope: "main_agent",
    usageStatus: "unavailable",
    hasSubagents: false,
  };
  respondDetail(
    makeProjection({
      attempts: [attempt],
      providerThreads: [
        providerThread("provider-thread-1", { contextUsage }),
        providerThread("provider-thread-0", { status: "closed", ownerNodeId: ids.nodeId }),
      ],
      providerTurns: [
        providerTurn("provider-turn-1", { runAttemptId: "attempt-1", tokenUsage, turnTokenUsage }),
        providerTurn("provider-turn-0", {
          providerThreadId: "provider-thread-0",
          runAttemptId: "attempt-0",
        }),
      ],
    }),
  );
  const usage = await threads.usage(ids.threadId);
  expect(usage.threadId).toBe(ids.threadId);
  expect(usage.providerThreads).toEqual([
    {
      providerThreadId: "provider-thread-1",
      providerInstanceId: "sample-provider",
      appThreadId: ids.threadId,
      ownerNodeId: null,
      status: "idle",
      contextUsage,
    },
    {
      providerThreadId: "provider-thread-0",
      providerInstanceId: "sample-provider",
      appThreadId: ids.threadId,
      ownerNodeId: ids.nodeId,
      status: "closed",
      contextUsage: null,
    },
  ]);
  expect(usage.providerTurns[0]).toMatchObject({
    providerTurnId: "provider-turn-1",
    runAttemptId: "attempt-1",
    runId: "run-1",
    tokenUsage,
    turnTokenUsage,
  });
  expect(usage.providerTurns[1]).toMatchObject({ runAttemptId: "attempt-0", runId: null });
  expect(usage.providerTurns[1]).not.toHaveProperty("tokenUsage");
  expect(usage.providerTurns[1]).not.toHaveProperty("turnTokenUsage");
});

it("reports a thread without provider history as empty usage lists", async () => {
  respondDetail(makeProjection());
  expect(await threads.usage(ids.threadId)).toEqual({
    threadId: ids.threadId,
    providerThreads: [],
    providerTurns: [],
  });
});
