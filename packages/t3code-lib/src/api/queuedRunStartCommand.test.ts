// ---
// relationships:
//   verifies: library-wire
// ---
import { afterEach, beforeEach, describe, expect, expectTypeOf, it } from "vite-plus/test";
import { FakeT3Server } from "../../test/support/fakeServer.ts";
import { ids } from "../../test/support/threadFixtures.ts";
import {
  malformedQueuedRunStarts,
  queuedRunStart,
} from "../../test/support/queuedRunStartFixtures.ts";
import { T3InterruptedError, T3PreconditionError, T3RpcError } from "../errors.ts";
import type { T3Client } from "../index.ts";
import { RpcClient } from "../rpc/client.ts";
import { rpcMethods, type RpcMethods } from "../rpc/registry.ts";
import type { RpcPayload } from "../rpc/spec.ts";
import type { QueuedRunStartCommand } from "../schemas/orchestration/commands.ts";
import { HttpTransport } from "../transport/http.ts";
import { RpcConnection } from "../transport/rpcConnection.ts";
import { SocketTransport } from "../transport/socket.ts";
import { CommandDispatcher } from "./dispatch.ts";
import { ThreadsApi } from "./threads.ts";

const until = async (check: () => boolean, ms = 3_000): Promise<void> => {
  const deadline = Date.now() + ms;
  while (!check()) {
    if (Date.now() > deadline) throw new Error("condition not met");
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
};

describe("queued-run.start through public dispatch paths", () => {
  let server: FakeT3Server;
  let connection: RpcConnection;
  let rpc: RpcClient<RpcMethods>;
  let threads: ThreadsApi;
  let dispatched: Record<string, unknown>[];

  beforeEach(async () => {
    server = await FakeT3Server.start();
    dispatched = [];
    connection = new RpcConnection(new SocketTransport({ url: async () => server.wsUrl }));
    rpc = new RpcClient(connection, rpcMethods);
    threads = new ThreadsApi(
      new HttpTransport({
        baseUrl: server.httpUrl,
        fetch: server.fetch,
        getAccessToken: async () => "sample-token",
      }),
      rpc,
      new CommandDispatcher(rpc),
    );
    server.handle("orchestration.dispatchCommand", (payload) => {
      dispatched.push(payload as Record<string, unknown>);
      return { kind: "value", value: { sequence: 7 } };
    });
  });
  afterEach(async () => {
    await connection.close();
    await server.close();
  });

  it("types queued-run.start on threads.dispatch and typed rpc.call", () => {
    expectTypeOf<QueuedRunStartCommand>().toExtend<Parameters<ThreadsApi["dispatch"]>[0]>();
    expectTypeOf<QueuedRunStartCommand>().toExtend<
      Parameters<T3Client["threads"]["dispatch"]>[0]
    >();
    expectTypeOf<
      Extract<RpcPayload<RpcMethods, "orchestration.dispatchCommand">, { type: "queued-run.start" }>
    >().toEqualTypeOf<QueuedRunStartCommand>();
  });

  it("sends the command with unknown metadata and normalized ids through both paths", async () => {
    const value = queuedRunStart({
      future: "preserved",
    }) as QueuedRunStartCommand;
    expect(await threads.dispatch(value)).toEqual({ sequence: 7 });
    expect(await rpc.call("orchestration.dispatchCommand", value)).toEqual({
      sequence: 7,
    });
    const padded = queuedRunStart({
      runId: ` ${ids.runId} `,
    }) as QueuedRunStartCommand;
    await threads.dispatch(padded);
    await rpc.call("orchestration.dispatchCommand", padded);
    expect(dispatched).toEqual([value, value, queuedRunStart(), queuedRunStart()]);
    expect(server.routes.requests).toEqual([]);
  });

  it("rejects malformed known fields before sending on both paths", async () => {
    await threads.dispatch(queuedRunStart() as QueuedRunStartCommand);
    await rpc.call("orchestration.dispatchCommand", queuedRunStart() as QueuedRunStartCommand);
    expect(dispatched).toHaveLength(2);
    dispatched.length = 0;
    for (const [label, value] of malformedQueuedRunStarts) {
      const command = value as QueuedRunStartCommand;
      await expect(threads.dispatch(command), label).rejects.toBeInstanceOf(T3PreconditionError);
      await expect(
        rpc.call("orchestration.dispatchCommand", command),
        label,
      ).rejects.toBeInstanceOf(T3PreconditionError);
    }
    expect(dispatched).toEqual([]);
    expect(server.lastConnection.received.filter((e) => e["_tag"] === "Request")).toHaveLength(2);
  });

  it("forwards the caller's abort signal on both paths", async () => {
    server.handle("orchestration.dispatchCommand", (payload) => {
      dispatched.push(payload as Record<string, unknown>);
      return { kind: "hang" };
    });
    const command = queuedRunStart() as QueuedRunStartCommand;
    const viaThreads = new AbortController();
    const pendingThreads = threads.dispatch(command, viaThreads.signal);
    await until(() => dispatched.length === 1);
    viaThreads.abort();
    await expect(pendingThreads).rejects.toBeInstanceOf(T3InterruptedError);
    const viaRpc = new AbortController();
    const pendingRpc = rpc.call("orchestration.dispatchCommand", command, viaRpc.signal);
    await until(() => dispatched.length === 2);
    viaRpc.abort();
    await expect(pendingRpc).rejects.toBeInstanceOf(T3InterruptedError);
    await until(() => server.lastConnection.interrupts.length === 2);
    expect(dispatched).toEqual([command, command]);
  });

  it("propagates the typed dispatch error from the server", async () => {
    server.handle("orchestration.dispatchCommand", () => ({
      kind: "fail",
      error: {
        _tag: "OrchestrationV2DispatchCommandError",
        commandId: "command-1",
        commandType: "queued-run.start",
        message: "Orchestration command failed.",
      },
    }));
    const command = queuedRunStart() as QueuedRunStartCommand;
    for (const attempt of [
      () => threads.dispatch(command),
      () => rpc.call("orchestration.dispatchCommand", command),
    ]) {
      const error = await attempt().catch((caught: unknown) => caught);
      expect(error).toBeInstanceOf(T3RpcError);
      expect(error).toMatchObject({
        code: "rpc_failed",
        tag: "OrchestrationV2DispatchCommandError",
      });
      if (error instanceof T3RpcError && error.is("OrchestrationV2DispatchCommandError")) {
        expect(error.record.commandType).toBe("queued-run.start");
      } else {
        throw new Error("expected a recognised dispatch error record");
      }
    }
  });
});
