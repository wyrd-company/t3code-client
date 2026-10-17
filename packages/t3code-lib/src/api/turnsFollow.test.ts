/** Which run a TurnHandle follows, against the fake server. The pure rules are in turnAdoption.test.ts. */
import { afterEach, beforeEach, describe, expect, it } from "vite-plus/test";
import { FakeT3Server } from "../../test/support/fakeServer.ts";
import {
  at,
  events,
  ids,
  makeMessage,
  makeProjection,
  makeRun,
  makeSnapshot,
  snapshotItem,
} from "../../test/support/threadFixtures.ts";
import { RpcClient } from "../rpc/client.ts";
import { rpcMethods } from "../rpc/registry.ts";
import type { OrchestrationV2ThreadProjection } from "../schemas/orchestration/projection.ts";
import { HttpTransport } from "../transport/http.ts";
import { RpcConnection } from "../transport/rpcConnection.ts";
import { SocketTransport } from "../transport/socket.ts";
import { CommandDispatcher } from "./dispatch.ts";
import { ThreadsApi } from "./threads.ts";

describe("TurnHandle follows its run", () => {
  let server: FakeT3Server;
  let connection: RpcConnection;
  let threads: ThreadsApi;
  let dispatched: Record<string, unknown>[];
  let projection: OrchestrationV2ThreadProjection;

  beforeEach(async () => {
    server = await FakeT3Server.start();
    dispatched = [];
    projection = makeProjection();
    connection = new RpcConnection(new SocketTransport({ url: async () => server.wsUrl }));
    const rpc = new RpcClient(connection, rpcMethods);
    const http = new HttpTransport({
      baseUrl: server.httpUrl,
      fetch: server.fetch,
      getAccessToken: async () => "token-1",
    });
    threads = new ThreadsApi(http, rpc, new CommandDispatcher(rpc));
    server.handle("orchestration.dispatchCommand", (payload) => {
      dispatched.push(payload as Record<string, unknown>);
      return { kind: "value", value: { sequence: 10 } };
    });
    server.handle("orchestration.getThreadProjection", () => ({
      kind: "value",
      value: projection,
    }));
    server.routes.route(`GET /api/orchestration/threads/${ids.threadId}`, () => ({
      status: 200,
      body: makeSnapshot(projection, 10),
    }));
  });
  afterEach(async () => {
    await connection.close();
    await server.close();
  });

  const script = (chunks: Record<string, unknown>[]) =>
    server.handle("orchestration.subscribeThread", () => ({
      kind: "stream",
      chunks: chunks.map((item) => [item]),
    }));

  it("ignores a run that took another message and settles on its own", async () => {
    const handle = await threads.startTurn({ threadId: ids.threadId, text: "Mine." });
    const other = { id: "run-other", userMessageId: "message-other" };
    script([
      events.runCreated(11, other),
      events.runUpdated(12, { ...other, status: "completed", completedAt: at }),
      events.runCreated(13, { userMessageId: handle.messageId, ordinal: 2 }),
      events.runUpdated(14, { userMessageId: handle.messageId, ordinal: 2, status: "interrupted" }),
    ]);
    const iterator = handle.events()[Symbol.asyncIterator]();
    await iterator.next(); // snapshot
    await iterator.next(); // run-other created
    await iterator.next(); // run-other updated
    expect(handle.runId).toBeUndefined();
    await expect(handle.completion).resolves.toMatchObject({
      state: "interrupted",
      runId: ids.runId,
    });
    expect(handle.runId).toBe(ids.runId);
  });

  it("settles from the snapshot when it already links our message to a finished run", async () => {
    const handle = await threads.startTurn({ threadId: ids.threadId, text: "Mine." });
    const settled = makeProjection({
      runs: [makeRun({ userMessageId: handle.messageId, status: "completed", completedAt: at })],
      messages: [
        makeMessage({ id: handle.messageId, text: "Mine." }),
        makeMessage({ id: "message-2", role: "assistant", text: "done", createdBy: "agent" }),
      ],
    });
    script([snapshotItem(12, settled)]);
    await expect(handle.completion).resolves.toMatchObject({
      state: "completed",
      runId: ids.runId,
      assistantMessage: { text: "done" },
    });
    expect(server.routes.requests.map((r) => r.path)).not.toContain(
      `/api/orchestration/threads/${ids.threadId}`,
    );
  });

  it("follows the active run our message was steered into, named by message.updated", async () => {
    projection = makeProjection({
      runs: [makeRun({ userMessageId: "message-0", status: "running" })],
    });
    const handle = await threads.startTurn({ threadId: ids.threadId, text: "Also this." });
    script([
      events.messageUpdated(11, { id: handle.messageId, text: "Also this." }),
      events.runUpdated(12, { userMessageId: "message-0", status: "completed", completedAt: at }),
    ]);
    const iterator = handle.events()[Symbol.asyncIterator]();
    await iterator.next(); // snapshot
    expect(handle.runId).toBeUndefined();
    await iterator.next(); // message.updated
    expect(handle.runId).toBe(ids.runId);
    await expect(handle.completion).resolves.toMatchObject({
      state: "completed",
      runId: ids.runId,
    });
  });

  it("interrupt() targets the followed run, or the thread's active run before ours is known", async () => {
    projection = makeProjection({ runs: [makeRun({ id: "run-active", status: "running" })] });
    server.handle("orchestration.subscribeThread", (_payload, context) => {
      context.connection.send({
        _tag: "Chunk",
        requestId: context.requestId,
        values: [events.runCreated(11, { userMessageId: "message-other" })],
      });
      return { kind: "hang" };
    });
    const handle = await threads.startTurn({ threadId: ids.threadId, text: "Mine." });
    const iterator = handle.events()[Symbol.asyncIterator]();
    await iterator.next(); // snapshot
    await iterator.next(); // the other run
    await handle.interrupt();
    expect(dispatched[1]).toMatchObject({ type: "run.interrupt", runId: "run-active" });

    server.lastConnection.send({
      _tag: "Chunk",
      requestId: String(
        server.lastConnection.received.findLast(
          (e) => e["tag"] === "orchestration.subscribeThread",
        )?.["id"],
      ),
      values: [
        events.runCreated(12, { id: "run-mine", userMessageId: handle.messageId, ordinal: 2 }),
      ],
    });
    await iterator.next(); // our run
    expect(handle.runId).toBe("run-mine");
    await handle.interrupt();
    expect(dispatched[2]).toMatchObject({ type: "run.interrupt", runId: "run-mine" });
    await iterator.return?.();
  });
});
