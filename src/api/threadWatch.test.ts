import { afterEach, beforeEach, describe, expect, it } from "vite-plus/test";
import { FakeT3Server } from "../../test/support/fakeServer.ts";
import {
  at,
  completedRunItems,
  events,
  ids,
  items,
  makeProjection,
  makeRun,
  makeRuntimeRequest,
  makeSnapshot,
  snapshotItem,
} from "../../test/support/threadFixtures.ts";
import { RpcClient } from "../rpc/client.ts";
import { rpcMethods } from "../rpc/registry.ts";
import { RpcConnection } from "../transport/rpcConnection.ts";
import { SocketTransport } from "../transport/socket.ts";
import { watchThread, type ThreadWatchItem } from "./threadWatch.ts";

const sequenceOf = (item: ThreadWatchItem): number | undefined =>
  item.kind === "event" ? item.sequence : undefined;

describe("watchThread", () => {
  let server: FakeT3Server;
  let connection: RpcConnection;
  let rpc: RpcClient<typeof rpcMethods>;

  beforeEach(async () => {
    server = await FakeT3Server.start();
    connection = new RpcConnection(
      new SocketTransport({
        url: async () => server.wsUrl,
        backoff: { initialMs: 10, factor: 1, maxMs: 10 },
      }),
    );
    rpc = new RpcClient(connection, rpcMethods);
  });
  afterEach(async () => {
    await connection.close();
    await server.close();
  });

  it("passes frames through and derives deltas, requests, and the settled run", async () => {
    server.handle("orchestration.subscribeThread", () => ({
      kind: "stream",
      chunks: [
        [snapshotItem(10), { kind: "synchronized" }],
        [events.runCreated(11)],
        [events.turnItemUpdated(12, items.assistantMessage("po"))],
        [events.runtimeRequestUpdated(13, "r1")],
        [events.runtimeRequestUpdated(14, "r1", { status: "resolved", resolvedAt: at })],
        [events.turnItemUpdated(15, items.assistantMessage("pong", false))],
        [events.runUpdated(16, { status: "completed", completedAt: at })],
      ],
    }));
    const collected: ThreadWatchItem[] = [];
    for await (const item of watchThread(rpc, ids.threadId)) collected.push(item);
    expect(collected.map((i) => i.kind)).toEqual([
      "snapshot",
      "synchronized",
      "event",
      "event",
      "assistant-delta",
      "event",
      "approval-requested",
      "event",
      "request-resolved",
      "event",
      "assistant-delta",
      "event",
      "turn-settled",
    ]);
    expect(collected[0]).toMatchObject({ kind: "snapshot", snapshot: { snapshotSequence: 10 } });
    expect(collected[2]).toMatchObject({
      kind: "event",
      sequence: 11,
      event: { type: "run.created" },
    });
    expect(collected[6]).toMatchObject({
      kind: "approval-requested",
      requestId: "r1",
      item: undefined,
    });
    const settled = collected.at(-1);
    expect(settled?.kind === "turn-settled" && settled.outcome).toMatchObject({
      state: "completed",
      runId: ids.runId,
      run: { status: "completed" },
    });
  });

  it("announces requests that are already open in the snapshot", async () => {
    const projection = makeProjection({
      runtimeRequests: [makeRuntimeRequest("r9", { kind: "user_input" })],
      turnItems: [items.userInputRequest("r9")],
    });
    server.handle("orchestration.subscribeThread", () => ({
      kind: "stream",
      chunks: [[snapshotItem(3, projection)]],
    }));
    const collected: ThreadWatchItem[] = [];
    for await (const item of watchThread(rpc, ids.threadId)) collected.push(item);
    expect(collected.map((i) => i.kind)).toEqual(["snapshot", "user-input-requested"]);
    expect(collected[1]).toMatchObject({ requestId: "r9", questions: [{ id: "q1" }] });
  });

  it("resumes after a dropped socket with afterSequence and without duplicate events", async () => {
    const payloads: Record<string, unknown>[] = [];
    server.handle("orchestration.subscribeThread", (payload, context) => {
      payloads.push(payload as Record<string, unknown>);
      if (payloads.length === 1) {
        context.connection.send({
          _tag: "Chunk",
          requestId: context.requestId,
          values: [snapshotItem(10), events.runCreated(11)],
        });
        return { kind: "hang" };
      }
      return {
        kind: "stream",
        chunks: [
          [events.runCreated(11)],
          [{ kind: "synchronized" }],
          [events.runUpdated(12, { status: "completed", completedAt: at })],
        ],
      };
    });
    const collected: ThreadWatchItem[] = [];
    for await (const item of watchThread(rpc, ids.threadId, { acceptBoundedSnapshot: true })) {
      collected.push(item);
      if (sequenceOf(item) === 11 && payloads.length === 1) server.connections[0]?.drop();
    }
    expect(payloads[0]).toEqual({
      threadId: ids.threadId,
      requestCompletionMarker: true,
      acceptBoundedSnapshot: true,
    });
    expect(payloads[1]).toMatchObject({ afterSequence: 11, threadId: ids.threadId });
    expect(collected.map((i) => i.kind)).toEqual([
      "snapshot",
      "event",
      "reconnected",
      "synchronized",
      "event",
      "turn-settled",
    ]);
    expect(collected.map(sequenceOf).filter((s) => s !== undefined)).toEqual([11, 12]);
    expect(collected[2]).toEqual({ kind: "reconnected", afterSequence: 11 });
  });

  it("seeds from the snapshot loader when resuming and does not re-apply replayed events", async () => {
    const seeded = makeProjection({
      runs: [makeRun({ status: "completed", completedAt: at })],
      turnItems: [items.assistantMessage("pong", false)],
    });
    server.handle("orchestration.subscribeThread", () => ({
      kind: "stream",
      chunks: [
        [events.runCreated(11)],
        [events.turnItemUpdated(12, items.assistantMessage("pong", false))],
        [events.runUpdated(13, { status: "completed", completedAt: at })],
        [{ kind: "synchronized" }],
        [events.turnItemUpdated(14, items.assistantMessage("pong!", false))],
      ],
    }));
    let loads = 0;
    const collected: ThreadWatchItem[] = [];
    const watch = watchThread(rpc, ids.threadId, {
      afterSequence: 10,
      snapshotLoader: async () => {
        loads += 1;
        return makeSnapshot(seeded, 13);
      },
    });
    for await (const item of watch) collected.push(item);
    expect(loads).toBe(1);
    expect(collected.map((i) => i.kind)).toEqual([
      "snapshot",
      "event",
      "event",
      "event",
      "synchronized",
      "event",
      "assistant-delta",
    ]);
    const delta = collected.at(-1);
    expect(delta?.kind === "assistant-delta" && [delta.text, delta.delta]).toEqual(["pong!", "!"]);
  });

  it("passes an event of an unknown type through without changing the projection", async () => {
    const unknown = {
      ...events.runCreated(11),
      event: { ...(events.runCreated(11)["event"] as object), type: "run.something-new" },
    };
    server.handle("orchestration.subscribeThread", () => ({
      kind: "stream",
      chunks: [[snapshotItem(10)], [unknown], ...completedRunItems(12).map((item) => [item])],
    }));
    const collected: ThreadWatchItem[] = [];
    for await (const item of watchThread(rpc, ids.threadId)) collected.push(item);
    expect(collected[1]).toMatchObject({ kind: "event", sequence: 11, event: { unknown: true } });
    const settled = collected.at(-1);
    expect(settled?.kind === "turn-settled" && settled.outcome.projection.runs).toHaveLength(1);
  });

  it("returns silently on abort and throws on a fatal connection error", async () => {
    server.handle("orchestration.subscribeThread", (_payload, context) => {
      context.connection.send({
        _tag: "Chunk",
        requestId: context.requestId,
        values: [snapshotItem(1)],
      });
      return { kind: "hang" };
    });
    const controller = new AbortController();
    const kinds: string[] = [];
    for await (const item of watchThread(rpc, ids.threadId, { signal: controller.signal })) {
      kinds.push(item.kind);
      controller.abort();
    }
    expect(kinds).toEqual(["snapshot"]);

    await connection.close();
    const iterator = watchThread(rpc, ids.threadId)[Symbol.asyncIterator]();
    await expect(iterator.next()).rejects.toMatchObject({ code: "connection" });
  });
});
