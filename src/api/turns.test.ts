import { afterEach, beforeEach, describe, expect, it } from "vite-plus/test";
import { FakeT3Server } from "../../test/support/fakeServer.ts";
import {
  at,
  events,
  ids,
  items,
  makeProjection,
  makeSnapshot,
} from "../../test/support/threadFixtures.ts";
import { RpcClient } from "../rpc/client.ts";
import { rpcMethods } from "../rpc/registry.ts";
import { HttpTransport } from "../transport/http.ts";
import { RpcConnection } from "../transport/rpcConnection.ts";
import { SocketTransport } from "../transport/socket.ts";
import { CommandDispatcher } from "./dispatch.ts";
import { ThreadsApi } from "./threads.ts";
import type { ThreadWatchItem } from "./threadWatch.ts";
import { inspectTurn } from "./turns.ts";

/** The items a run for `userMessageId` produces: a reply streamed in two parts, then completion. */
const completedRun = (from: number, userMessageId: string, text = "pong") => [
  events.runCreated(from, { userMessageId }),
  events.turnItemUpdated(from + 1, items.assistantMessage(text.slice(0, 2))),
  events.turnItemUpdated(from + 2, items.assistantMessage(text)),
  events.messageUpdated(from + 3, {
    id: "message-2",
    role: "assistant",
    text,
    createdBy: "agent",
    creationSource: "provider",
  }),
  events.runUpdated(from + 4, { userMessageId, status: "completed", completedAt: at }),
];

describe("ThreadsApi.startTurn", () => {
  let server: FakeT3Server;
  let connection: RpcConnection;
  let threads: ThreadsApi;
  let dispatched: Record<string, unknown>[];
  let subscriptions: Record<string, unknown>[];

  beforeEach(async () => {
    server = await FakeT3Server.start();
    dispatched = [];
    subscriptions = [];
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
    server.routes.route(`GET /api/orchestration/threads/${ids.threadId}`, () => ({
      status: 200,
      body: makeSnapshot(makeProjection(), 10),
    }));
  });
  afterEach(async () => {
    await connection.close();
    await server.close();
  });

  /** Scripts the subscription; called after startTurn so the run can name our message. */
  const script = (chunks: Record<string, unknown>[]) =>
    server.handle("orchestration.subscribeThread", (payload) => {
      subscriptions.push(payload as Record<string, unknown>);
      return { kind: "stream", chunks: chunks.map((item) => [item]) };
    });

  it("dispatches message.dispatch and resolves completion from the run's events", async () => {
    const handle = await threads.startTurn({ threadId: ids.threadId, text: "Say pong." });
    expect(handle.sequence).toBe(10);
    expect(dispatched).toEqual([
      {
        type: "message.dispatch",
        createdBy: "user",
        creationSource: "web",
        commandId: handle.commandId,
        threadId: ids.threadId,
        messageId: handle.messageId,
        text: "Say pong.",
        attachments: [],
        dispatchMode: { type: "start_immediately" },
        deliveryIntent: "auto",
      },
    ]);
    script(completedRun(11, handle.messageId));
    const collected: ThreadWatchItem[] = [];
    const collect = (async () => {
      for await (const item of handle.events()) collected.push(item);
    })();
    const outcome = await handle.completion;
    await collect;
    expect(outcome).toMatchObject({
      state: "completed",
      runId: ids.runId,
      run: { status: "completed" },
      assistantMessage: { id: "message-2", text: "pong" },
    });
    expect(outcome.error).toBeUndefined();
    expect(handle.runId).toBe(ids.runId);
    // Resumes after the receipt, seeded over HTTP, and ends once the run settled.
    expect(subscriptions[0]).toMatchObject({
      threadId: ids.threadId,
      afterSequence: 10,
      requestCompletionMarker: true,
    });
    expect(collected[0]?.kind).toBe("snapshot");
    expect(
      collected.flatMap((i) => (i.kind === "assistant-delta" ? [[i.text, i.delta]] : [])),
    ).toEqual([
      ["po", "po"],
      ["pong", "ng"],
    ]);
    expect(collected.at(-1)?.kind).toBe("turn-settled");
  });

  it("resolves completion without events() being consumed", async () => {
    const handle = await threads.startTurn({ threadId: ids.threadId, text: "Say pong." });
    script(completedRun(11, handle.messageId));
    await expect(handle.completion).resolves.toMatchObject({ state: "completed" });
    expect(inspectTurn(handle)).toEqual({ subscribers: 0, buffered: 0 });
  });

  it("resolves a failed outcome with the run's error item message", async () => {
    const handle = await threads.startTurn({ threadId: ids.threadId, text: "Say pong." });
    script([
      events.runCreated(11, { userMessageId: handle.messageId }),
      events.turnItemUpdated(12, items.error("provider down")),
      events.runUpdated(13, { userMessageId: handle.messageId, status: "failed", completedAt: at }),
    ]);
    await expect(handle.completion).resolves.toMatchObject({
      state: "failed",
      runId: ids.runId,
      error: "provider down",
    });
  });

  it("rejects completion with T3InterruptedError when the caller aborts", async () => {
    server.handle("orchestration.subscribeThread", () => ({ kind: "hang" }));
    const controller = new AbortController();
    const handle = await threads.startTurn({
      threadId: ids.threadId,
      text: "Say pong.",
      signal: controller.signal,
    });
    const completion = handle.completion;
    controller.abort();
    await expect(completion).rejects.toMatchObject({ code: "interrupted" });
  });

  it("rejects completion when the watch ends before the run settles", async () => {
    const handle = await threads.startTurn({ threadId: ids.threadId, text: "Say pong." });
    script([events.runCreated(11, { userMessageId: handle.messageId })]);
    await expect(handle.completion).rejects.toMatchObject({ code: "interrupted" });
    expect(handle.runId).toBe(ids.runId);
  });

  it("events() buffers nothing until iterated and drops a consumer that returns", async () => {
    server.handle("orchestration.subscribeThread", (_payload, context) => {
      context.connection.send({
        _tag: "Chunk",
        requestId: context.requestId,
        values: [events.runCreated(11, { userMessageId: "message-other" })],
      });
      return { kind: "hang" };
    });
    const controller = new AbortController();
    const handle = await threads.startTurn({
      threadId: ids.threadId,
      text: "Say pong.",
      signal: controller.signal,
    });
    const idle = handle.events(); // never iterated
    const completion = handle.completion;
    const iterator = handle.events()[Symbol.asyncIterator]();
    expect((await iterator.next()).value).toMatchObject({ kind: "snapshot" });
    expect((await iterator.next()).value).toMatchObject({ kind: "event", sequence: 11 });
    expect(inspectTurn(handle)).toEqual({ subscribers: 1, buffered: 0 });
    await iterator.return?.();
    expect(inspectTurn(handle)).toEqual({ subscribers: 0, buffered: 0 });
    void idle;
    controller.abort();
    await expect(completion).rejects.toMatchObject({ code: "interrupted" });
  });

  it("a consumer attached after settlement sees an ended stream", async () => {
    const handle = await threads.startTurn({ threadId: ids.threadId, text: "Say pong." });
    script(completedRun(11, handle.messageId));
    await handle.completion;
    const late: ThreadWatchItem[] = [];
    for await (const item of handle.events()) late.push(item);
    expect(late).toEqual([]);
  });
});
