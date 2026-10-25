// ---
// relationships:
//   verifies: library-wire
// ---
import { afterEach, beforeEach, describe, expect, it } from "vite-plus/test";
import { FakeT3Server } from "../../test/support/fakeServer.ts";
import {
  ids,
  makeMessage,
  makeProjection,
  makeSnapshot,
  eventItem,
  snapshotItem,
} from "../../test/support/threadFixtures.ts";
import { RpcClient } from "../rpc/client.ts";
import { rpcMethods } from "../rpc/registry.ts";
import { HttpTransport } from "../transport/http.ts";
import { RpcConnection } from "../transport/rpcConnection.ts";
import { SocketTransport } from "../transport/socket.ts";
import { CommandDispatcher } from "./dispatch.ts";
import { ThreadsApi } from "./threads.ts";
import { T3DecodeError } from "../errors.ts";

describe("conversation workflow-script metadata through public thread reads", () => {
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

  it("preserves both booleans, omission and extra metadata over HTTP and RPC", async () => {
    for (const metadata of [{}, { workflowScript: true }, { workflowScript: false }]) {
      const message = makeMessage({ ...metadata, future: "preserved" });
      const projection = makeProjection({ messages: [message] });
      server.respond("orchestration.getThreadProjection", projection);
      server.routes.route(`GET /api/orchestration/threads/${ids.threadId}`, () => ({
        status: 200,
        body: makeSnapshot(projection, 1),
      }));
      const rpc = (await threads.projection(ids.threadId)).messages[0];
      const http = (await threads.detail(ids.threadId)).projection.messages[0];
      for (const decoded of [rpc, http]) {
        expect(decoded).toEqual(message);
        expect(Object.hasOwn(decoded ?? {}, "workflowScript")).toBe(
          Object.hasOwn(metadata, "workflowScript"),
        );
      }
    }
  });

  it("rejects malformed workflow-script metadata through HTTP and RPC", async () => {
    const projection = { ...makeProjection(), messages: [makeMessage({ workflowScript: "true" })] };
    server.respond("orchestration.getThreadProjection", projection);
    server.routes.route(`GET /api/orchestration/threads/${ids.threadId}`, () => ({
      status: 200,
      body: { snapshotSequence: 1, projection },
    }));
    await expect(threads.projection(ids.threadId)).rejects.toBeInstanceOf(T3DecodeError);
    await expect(threads.detail(ids.threadId)).rejects.toBeInstanceOf(T3DecodeError);
  });

  it("reports a malformed message event and recovers for the next valid event", async () => {
    server.handle("orchestration.subscribeThread", () => ({
      kind: "stream",
      chunks: [
        [snapshotItem(1)],
        [eventItem(2, "message.updated", makeMessage({ workflowScript: "true" }))],
        [
          eventItem(
            3,
            "message.updated",
            makeMessage({ workflowScript: false, future: "preserved" }),
          ),
        ],
      ],
    }));
    const seen = [];
    for await (const item of threads.watch(ids.threadId)) seen.push(item);
    expect(seen.map((item) => item.kind)).toEqual(["snapshot", "decode-error", "event"]);
    const last = seen.at(-1);
    if (last?.kind !== "event" || "unknown" in last.event || last.event.type !== "message.updated")
      throw new Error("Expected message update");
    expect(last.event.payload.workflowScript).toBe(false);
    expect(last.event.payload["future"]).toBe("preserved");
  });
});
