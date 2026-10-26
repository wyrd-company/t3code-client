// ---
// relationships:
//   verifies: library-wire
// ---
import { afterEach, beforeEach, describe, expect, it } from "vite-plus/test";
import { FakeT3Server } from "../../test/support/fakeServer.ts";
import {
  ids,
  at,
  makeAppThread,
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

const watch = {
  startedAt: at,
  headSha: null,
  failedChecks: [],
  passed: false,
  passedChecks: [],
  remarksThrough: at,
  remarkIds: [],
  conflicting: false,
  wakes: 0,
};

const link = (metadata: Record<string, unknown> = {}) => ({
  host: "example.invalid",
  repository: "sample/repository",
  number: 1,
  url: "https://example.invalid/sample/repository/pull/1",
  source: "manual",
  linkedAt: at,
  snapshot: null,
  stack: null,
  ...metadata,
});

describe("linked pull request ended-watch metadata through public thread reads", () => {
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

  it("preserves watch records, omission and extra metadata over HTTP and RPC", async () => {
    for (const metadata of [
      {},
      { endedWatch: watch },
      {
        endedWatch: {
          ...watch,
          headSha: "sample-head",
          failedChecks: ["sample-check"],
          passed: true,
          passedChecks: ["sample-other"],
          remarkIds: ["sample-remark"],
          conflicting: true,
          wakes: 2,
          futureWatch: "preserved",
        },
      },
    ]) {
      const value = link({ ...metadata, future: "preserved" });
      const projection = makeProjection({ thread: makeAppThread({ pullRequests: [value] }) });
      server.respond("orchestration.getThreadProjection", projection);
      server.routes.route(`GET /api/orchestration/threads/${ids.threadId}`, () => ({
        status: 200,
        body: makeSnapshot(projection, 1),
      }));
      for (const thread of [
        (await threads.projection(ids.threadId)).thread,
        (await threads.detail(ids.threadId)).projection.thread,
      ]) {
        expect(thread.pullRequests?.[0]).toEqual(value);
        expect(Object.hasOwn(thread.pullRequests?.[0] ?? {}, "endedWatch")).toBe(
          Object.hasOwn(metadata, "endedWatch"),
        );
      }
    }
  });

  it("rejects malformed ended-watch metadata through HTTP and RPC", async () => {
    const projection = {
      ...makeProjection(),
      thread: makeAppThread({ pullRequests: [link({ endedWatch: null })] }),
    };
    server.respond("orchestration.getThreadProjection", projection);
    server.routes.route(`GET /api/orchestration/threads/${ids.threadId}`, () => ({
      status: 200,
      body: { snapshotSequence: 1, projection },
    }));
    await expect(threads.projection(ids.threadId)).rejects.toBeInstanceOf(T3DecodeError);
    await expect(threads.detail(ids.threadId)).rejects.toBeInstanceOf(T3DecodeError);
  });

  it("reports malformed link metadata and recovers for the next valid link update", async () => {
    server.handle("orchestration.subscribeThread", () => ({
      kind: "stream",
      chunks: [
        [snapshotItem(1)],
        [eventItem(2, "thread.pull-request-link-updated", link({ endedWatch: null }))],
        [
          eventItem(
            3,
            "thread.pull-request-link-updated",
            link({
              endedWatch: watch,
              future: "preserved",
            }),
          ),
        ],
      ],
    }));
    const seen = [];
    for await (const item of threads.watch(ids.threadId)) seen.push(item);
    expect(seen.map((item) => item.kind)).toEqual(["snapshot", "decode-error", "event"]);
    const last = seen.at(-1);
    if (
      last?.kind !== "event" ||
      "unknown" in last.event ||
      last.event.type !== "thread.pull-request-link-updated"
    )
      throw new Error("Expected link update");
    expect(last.event.payload.endedWatch).toEqual(watch);
    expect(last.event.payload["future"]).toBe("preserved");
  });
});
