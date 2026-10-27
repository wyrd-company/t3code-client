// ---
// relationships:
//   verifies: automation-capabilities
// ---
import { afterEach, beforeEach, expect, it } from "vite-plus/test";
import { FakeT3Server } from "../../test/support/fakeServer.ts";
import {
  at,
  ids,
  makeProjection,
  makeRun,
  makeSnapshot,
} from "../../test/support/threadFixtures.ts";
import { T3PreconditionError, T3RpcError } from "../errors.ts";
import { RpcClient } from "../rpc/client.ts";
import { rpcMethods } from "../rpc/registry.ts";
import { HttpTransport } from "../transport/http.ts";
import { RpcConnection } from "../transport/rpcConnection.ts";
import { SocketTransport } from "../transport/socket.ts";
import { CommandDispatcher } from "./dispatch.ts";
import { latestDiffTurnCount } from "./threadDiffSearch.ts";
import { ThreadsApi } from "./threads.ts";

function checkpoint(id: string, runId: string | null, ordinal: number, status = "ready") {
  return {
    id,
    threadId: ids.threadId,
    scopeId: "scope-1",
    runId,
    nodeId: ids.nodeId,
    parentCheckpointId: null,
    ordinalWithinScope: ordinal,
    appRunOrdinal: ordinal,
    ref: `ref-${id}`,
    status,
    files: [],
    capturedAt: at,
  };
}
const projection = makeProjection({
  runs: [
    makeRun({ id: "run-1", ordinal: 1, status: "completed", completedAt: at }),
    makeRun({ id: "run-2", ordinal: 2, status: "completed", completedAt: at }),
    makeRun({ id: "run-3", ordinal: 3, status: "failed", completedAt: at }),
    makeRun({ id: "run-4", ordinal: 4, status: "completed", completedAt: at }),
  ],
  checkpoints: [
    checkpoint("checkpoint-1", "run-1", 1),
    checkpoint("checkpoint-2", "run-2", 2),
    checkpoint("checkpoint-3", "run-3", 3),
    checkpoint("checkpoint-4", "run-4", 4, "missing"),
  ],
});

let server: FakeT3Server;
let connection: RpcConnection;
let threads: ThreadsApi;
const payloads: Record<string, unknown[]> = {};
function capture(tag: string, value: unknown) {
  server.handle(tag, (payload) => {
    (payloads[tag] ??= []).push(payload);
    return { kind: "value", value };
  });
}
beforeEach(async () => {
  for (const key of Object.keys(payloads)) delete payloads[key];
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
  server.routes.route(`GET /api/orchestration/threads/${ids.threadId}`, () => ({
    status: 200,
    body: makeSnapshot(projection, 1),
  }));
});
afterEach(async () => {
  await connection.close();
  await server.close();
});

it("selects the latest ready checkpoint of a completed run, or 0", () => {
  expect(latestDiffTurnCount(projection)).toBe(2);
  expect(latestDiffTurnCount(makeProjection())).toBe(0);
});

it("diffs the full thread through the latest completed checkpoint by default", async () => {
  const diff = { threadId: ids.threadId, fromTurnCount: 0, toTurnCount: 2, diff: "sample diff\n" };
  capture("orchestration.getFullThreadDiff", diff);
  expect(await threads.diff(ids.threadId)).toEqual(diff);
  expect(payloads["orchestration.getFullThreadDiff"]).toEqual([
    { threadId: ids.threadId, toTurnCount: 2 },
  ]);
});

it("sends an explicit range through the turn diff with exact counts", async () => {
  const diff = { threadId: ids.threadId, fromTurnCount: 1, toTurnCount: 2, diff: "" };
  capture("orchestration.getTurnDiff", diff);
  expect(await threads.diff(ids.threadId, { fromTurnCount: 1, toTurnCount: 2 })).toEqual(diff);
  expect(payloads["orchestration.getTurnDiff"]).toEqual([
    { threadId: ids.threadId, fromTurnCount: 1, toTurnCount: 2 },
  ]);
});

it("rejects reversed or negative ranges before sending", async () => {
  capture("orchestration.getTurnDiff", {});
  for (const range of [
    { fromTurnCount: 2, toTurnCount: 1 },
    { fromTurnCount: -1, toTurnCount: 1 },
    { fromTurnCount: 0.5, toTurnCount: 1 },
  ]) {
    await expect(threads.diff(ids.threadId, range)).rejects.toBeInstanceOf(T3PreconditionError);
  }
  expect(payloads["orchestration.getTurnDiff"]).toBeUndefined();
});

it("propagates checkpoint diff failures", async () => {
  server.handle("orchestration.getTurnDiff", () => ({
    kind: "fail",
    error: { _tag: "OrchestrationGetTurnDiffError", message: "Checkpoint unavailable." },
  }));
  const failure = threads.diff(ids.threadId, { fromTurnCount: 0, toTurnCount: 9 });
  await expect(failure).rejects.toBeInstanceOf(T3RpcError);
  await expect(failure).rejects.toMatchObject({
    record: { _tag: "OrchestrationGetTurnDiffError" },
  });
});

it("bounds cross-thread search with the server's limit and reports it", async () => {
  const match = {
    threadId: ids.threadId,
    projectId: ids.projectId,
    source: "assistant",
    snippet: "sample needle",
    messageCreatedAt: null,
  };
  capture("orchestration.searchThreads", { matches: [match] });
  expect(await threads.search({ query: "needle" })).toEqual({ matches: [match], limit: 50 });
  expect(await threads.search({ query: "needle", limit: 1 })).toEqual({
    matches: [match],
    limit: 1,
  });
  expect(payloads["orchestration.searchThreads"]).toEqual([
    { query: "needle", limit: 50 },
    { query: "needle", limit: 1 },
  ]);
  for (const input of [
    { query: "n" },
    { query: "needle", limit: 0 },
    { query: "needle", limit: 51 },
  ]) {
    await expect(threads.search(input)).rejects.toBeInstanceOf(T3PreconditionError);
  }
  expect(payloads["orchestration.searchThreads"]).toHaveLength(2);
});

it("searches within one thread and keeps the server's position and completeness", async () => {
  const result = {
    snapshotSequence: 3,
    totalMatches: 2,
    activeIndex: 1,
    match: { entryId: "entry-1", runId: null, occurrence: 0 },
  };
  capture("orchestration.searchThread", result);
  const found = await threads.searchContent({ threadId: ids.threadId, query: "needle", index: 1 });
  expect(found).toEqual(result);
  expect(found).not.toHaveProperty("complete");
  expect(payloads["orchestration.searchThread"]).toEqual([
    { threadId: ids.threadId, query: "needle", index: 1 },
  ]);
});
