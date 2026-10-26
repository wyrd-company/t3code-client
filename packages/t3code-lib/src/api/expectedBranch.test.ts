// ---
// relationships:
//   verifies: library-wire
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
import { T3PreconditionError } from "../errors.ts";

describe("expected branch metadata through public commands", () => {
  let server: FakeT3Server;
  let threads: ThreadsApi;
  let connection: RpcConnection;
  beforeEach(async () => {
    server = await FakeT3Server.start();
    connection = new RpcConnection(new SocketTransport({ url: async () => server.wsUrl }));
    const rpc = new RpcClient(connection, rpcMethods);
    threads = new ThreadsApi(
      new HttpTransport({
        baseUrl: server.httpUrl,
        fetch: server.fetch,
        getAccessToken: async () => "sample-token",
      }),
      rpc,
      new CommandDispatcher(rpc),
    );
  });
  afterEach(async () => {
    await connection.close();
    await server.close();
  });

  it("sends null, trimmed strings and omission through update and dispatch", async () => {
    const received: Record<string, unknown>[] = [];
    server.handle("orchestration.dispatchCommand", (payload) => {
      received.push(payload as Record<string, unknown>);
      return { kind: "value", value: { sequence: 1 } };
    });
    for (const metadata of [{}, { expectedBranch: null }, { expectedBranch: " sample-branch " }]) {
      const value = { ...metadata, future: "preserved" };
      await threads.update(ids.threadId, value);
      await threads.dispatch({
        type: "thread.metadata.update",
        commandId: threads.dispatcher.newCommandId(),
        threadId: ids.threadId,
        ...value,
      });
      for (const payload of received.slice(-2)) {
        expect(payload["type"]).toBe("thread.metadata.update");
        expect(Object.hasOwn(payload, "expectedBranch")).toBe(
          Object.hasOwn(metadata, "expectedBranch"),
        );
        expect(payload["expectedBranch"]).toBe(
          metadata.expectedBranch?.trim() ?? metadata.expectedBranch,
        );
        expect(payload["future"]).toBe("preserved");
      }
    }
    expect(received).toHaveLength(6);
  });
  it("rejects malformed metadata before either public path sends", async () => {
    let sent = 0;
    server.handle("orchestration.dispatchCommand", () => {
      sent++;
      return { kind: "value", value: { sequence: 1 } };
    });
    for (const expectedBranch of ["", " ", true, false, 1, [], {}]) {
      await expect(
        threads.update(ids.threadId, { expectedBranch } as unknown as Parameters<
          ThreadsApi["update"]
        >[1]),
      ).rejects.toBeInstanceOf(T3PreconditionError);
      await expect(
        threads.dispatch({
          type: "thread.metadata.update",
          commandId: threads.dispatcher.newCommandId(),
          threadId: ids.threadId,
          expectedBranch,
        } as unknown as Parameters<ThreadsApi["dispatch"]>[0]),
      ).rejects.toBeInstanceOf(T3PreconditionError);
    }
    expect(sent).toBe(0);
  });
});
