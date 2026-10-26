// ---
// relationships:
//   verifies: library-wire
// ---
import { afterEach, beforeEach, describe, expect, expectTypeOf, it } from "vite-plus/test";
import { FakeT3Server } from "../../test/support/fakeServer.ts";
import { ids, makeProjection, makeRun } from "../../test/support/threadFixtures.ts";
import {
  malformedThreadStops,
  threadStop,
  threadStopReasons,
} from "../../test/support/threadStopFixtures.ts";
import { T3InterruptedError, T3PreconditionError, T3RpcError } from "../errors.ts";
import type { T3Client } from "../index.ts";
import { RpcClient } from "../rpc/client.ts";
import { rpcMethods, type RpcMethods } from "../rpc/registry.ts";
import type { RpcPayload } from "../rpc/spec.ts";
import type { ThreadStopCommand } from "../schemas/orchestration/commands.ts";
import type { OrchestrationV2ThreadProjection } from "../schemas/orchestration/projection.ts";
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

describe("thread.stop through public dispatch paths", () => {
  let server: FakeT3Server;
  let connection: RpcConnection;
  let rpc: RpcClient<RpcMethods>;
  let threads: ThreadsApi;
  let projection: OrchestrationV2ThreadProjection;
  let dispatched: Record<string, unknown>[];

  beforeEach(async () => {
    server = await FakeT3Server.start();
    projection = makeProjection();
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
    server.handle("orchestration.getThreadProjection", () => ({
      kind: "value",
      value: projection,
    }));
    server.handle("orchestration.dispatchCommand", (payload) => {
      dispatched.push(payload as Record<string, unknown>);
      return { kind: "value", value: { sequence: 7 } };
    });
  });
  afterEach(async () => {
    await connection.close();
    await server.close();
  });

  it("types thread.stop on threads.dispatch and typed rpc.call", () => {
    expectTypeOf<ThreadStopCommand>().toExtend<Parameters<ThreadsApi["dispatch"]>[0]>();
    expectTypeOf<ThreadStopCommand>().toExtend<Parameters<T3Client["threads"]["dispatch"]>[0]>();
    expectTypeOf<
      Extract<RpcPayload<RpcMethods, "orchestration.dispatchCommand">, { type: "thread.stop" }>
    >().toEqualTypeOf<ThreadStopCommand>();
  });

  it("sends every reason form and unknown metadata unchanged through both paths", async () => {
    for (const fields of threadStopReasons) {
      const value = threadStop({ ...fields, future: "preserved" }) as ThreadStopCommand;
      expect(await threads.dispatch(value)).toEqual({ sequence: 7 });
      expect(await rpc.call("orchestration.dispatchCommand", value)).toEqual({ sequence: 7 });
      expect(dispatched.slice(-2)).toEqual([value, value]);
      for (const sent of dispatched.slice(-2)) {
        expect(Object.hasOwn(sent, "reason")).toBe(Object.hasOwn(fields, "reason"));
      }
    }
    expect(dispatched).toHaveLength(threadStopReasons.length * 2);
    expect(server.routes.requests).toEqual([]);
  });

  it("rejects malformed known fields before sending on both paths", async () => {
    await threads.dispatch(threadStop() as ThreadStopCommand);
    await rpc.call("orchestration.dispatchCommand", threadStop() as ThreadStopCommand);
    expect(dispatched).toHaveLength(2);
    dispatched.length = 0;
    for (const [label, value] of malformedThreadStops) {
      const command = value as ThreadStopCommand;
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
    const command = threadStop({ reason: "sample" }) as ThreadStopCommand;
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
        commandType: "thread.stop",
        message: "Orchestration command failed.",
      },
    }));
    const command = threadStop() as ThreadStopCommand;
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
        expect(error.record.commandType).toBe("thread.stop");
      } else {
        throw new Error("expected a recognised dispatch error record");
      }
    }
  });

  it("keeps threads.stop as run.interrupt with holdQueue and never sends thread.stop", async () => {
    await threads.stop(ids.threadId);
    expect(dispatched).toEqual([]);
    projection = makeProjection({ runs: [makeRun({ status: "running" })] });
    await threads.stop(ids.threadId);
    expect(dispatched).toMatchObject([
      { type: "run.interrupt", threadId: ids.threadId, runId: ids.runId, holdQueue: true },
    ]);
    expect(dispatched.map((command) => command["type"])).not.toContain("thread.stop");
  });
});
