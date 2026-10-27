// ---
// relationships:
//   verifies: library
// ---
import { afterEach, beforeEach, describe, expect, it } from "vite-plus/test";
import { FakeT3Server } from "../../test/support/fakeServer.ts";
import { ids } from "../../test/support/threadFixtures.ts";
import { RpcClient } from "../rpc/client.ts";
import { rpcMethods } from "../rpc/registry.ts";
import { HttpTransport } from "../transport/http.ts";
import { RpcConnection } from "../transport/rpcConnection.ts";
import { SocketTransport } from "../transport/socket.ts";
import { CommandDispatcher } from "./dispatch.ts";
import { ThreadsApi } from "./threads.ts";
import { T3InterruptedError, T3PreconditionError, T3RpcError } from "../errors.ts";
import { runId, threadId } from "../schemas/common.ts";

describe("native Stop and queue facade controls", () => {
  let server: FakeT3Server;
  let client: { threads: ThreadsApi };
  let connection: RpcConnection;
  let sent: Record<string, unknown>[];
  beforeEach(async () => {
    server = await FakeT3Server.start();
    sent = [];
    connection = new RpcConnection(new SocketTransport({ url: async () => server.wsUrl }));
    const rpc = new RpcClient(connection, rpcMethods);
    client = {
      threads: new ThreadsApi(
        new HttpTransport({
          baseUrl: server.httpUrl,
          fetch: server.fetch,
          getAccessToken: async () => "sample-token",
        }),
        rpc,
        new CommandDispatcher(rpc),
      ),
    };
    server.handle("orchestration.dispatchCommand", (payload) => {
      sent.push(payload as Record<string, unknown>);
      return { kind: "value", value: { sequence: 7 } };
    });
  });
  afterEach(async () => {
    await connection.close();
    await server.close();
  });

  const controls = [
    {
      type: "thread.stop",
      call: (c: { threads: ThreadsApi }, signal?: AbortSignal) =>
        c.threads.stopThread(ids.threadId, {}, signal),
    },
    {
      type: "queue.resume",
      call: (c: { threads: ThreadsApi }, signal?: AbortSignal) =>
        c.threads.resumeQueue(ids.threadId, signal),
    },
    {
      type: "queued-run.start",
      call: (c: { threads: ThreadsApi }, signal?: AbortSignal) =>
        c.threads.startQueuedRun(ids.threadId, ids.runId, signal),
    },
  ];

  it("sends exact commands without reading active runs or capabilities and mints fresh ids", async () => {
    // No projection/config handlers: an accidental pre-read fails this test.
    for (const { type, call } of controls) {
      for (let attempt = 0; attempt < 2; attempt++) {
        await expect(call(client)).resolves.toBeUndefined();
        expect(sent.at(-1)).toEqual({
          type,
          commandId: expect.any(String),
          threadId: ids.threadId,
          ...(type === "queued-run.start" ? { runId: ids.runId } : {}),
        });
      }
    }
    expect(new Set(sent.map((command) => command["commandId"])).size).toBe(6);
    expect(server.routes.requests).toEqual([]);
    expect(
      server.lastConnection.received.filter((e) => e["_tag"] === "Request").map((e) => e["tag"]),
    ).toEqual(Array(6).fill("orchestration.dispatchCommand"));
  });

  it.each([undefined, "", " padded ", "\nreason\t"])(
    "preserves reason %j exactly",
    async (reason) => {
      await client.threads.stopThread(
        threadId(` ${ids.threadId} `),
        reason === undefined ? {} : { reason },
      );
      expect(sent[0]).toEqual({
        type: "thread.stop",
        commandId: expect.any(String),
        threadId: ids.threadId,
        ...(reason === undefined ? {} : { reason }),
      });
    },
  );

  it("validates ids and reason before sending", async () => {
    const bad = " " as typeof ids.threadId;
    const attempts = [
      () => client.threads.stopThread(bad),
      () => client.threads.resumeQueue(bad),
      () => client.threads.startQueuedRun(bad, ids.runId),
      () => client.threads.startQueuedRun(ids.threadId, " " as typeof ids.runId),
      () => client.threads.stopThread(ids.threadId, { reason: 3 as unknown as string }),
    ];
    for (const call of attempts) await expect(call()).rejects.toBeInstanceOf(T3PreconditionError);
    expect(sent).toEqual([]);
    expect(server.connections).toHaveLength(0);
    await client.threads.startQueuedRun(threadId(" thread-1 "), runId(" run-1 "));
    expect(sent[0]).toMatchObject({ threadId: "thread-1", runId: "run-1" });
  });

  it.each(controls)("forwards cancellation for $type", async ({ call }) => {
    server.handle("orchestration.dispatchCommand", (payload) => {
      sent.push(payload as Record<string, unknown>);
      return { kind: "hang" };
    });
    const abort = new AbortController();
    const pending = call(client, abort.signal);
    const rejected = expect(pending).rejects.toBeInstanceOf(T3InterruptedError);
    await expect.poll(() => sent.length).toBe(1);
    abort.abort();
    await rejected;
    await expect.poll(() => server.lastConnection.interrupts.length).toBe(1);
  });

  it.each(controls)(
    "preserves dispatch errors for $type without a fallback",
    async ({ type, call }) => {
      server.handle("orchestration.dispatchCommand", (payload) => {
        sent.push(payload as Record<string, unknown>);
        return {
          kind: "fail",
          error: {
            _tag: "OrchestrationV2DispatchCommandError",
            commandId: "command-1",
            commandType: type,
            message: "Sample rejection.",
          },
        };
      });
      const error = await call(client).catch((error: unknown) => error);
      expect(error).toBeInstanceOf(T3RpcError);
      expect(error).toMatchObject({
        tag: "OrchestrationV2DispatchCommandError",
        record: { commandType: type },
      });
      expect(sent).toHaveLength(1);
    },
  );
});
