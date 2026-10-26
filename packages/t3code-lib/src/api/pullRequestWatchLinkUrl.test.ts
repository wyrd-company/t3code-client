// ---
// relationships:
//   verifies: library-wire
// ---
import { afterEach, beforeEach, describe, expect, it } from "vite-plus/test";
import { FakeT3Server } from "../../test/support/fakeServer.ts";
import { ids } from "../../test/support/threadFixtures.ts";
import { T3PreconditionError } from "../errors.ts";
import { RpcClient } from "../rpc/client.ts";
import { rpcMethods } from "../rpc/registry.ts";
import { RpcConnection } from "../transport/rpcConnection.ts";
import { SocketTransport } from "../transport/socket.ts";
import { HttpTransport } from "../transport/http.ts";
import { CommandDispatcher } from "./dispatch.ts";
import { ThreadsApi } from "./threads.ts";

const command = (metadata: Record<string, unknown> = {}) => ({
  type: "thread.pull-request.watch" as const,
  commandId: "command-1" as never,
  threadId: ids.threadId,
  host: "example.invalid",
  repository: "sample/repository",
  number: 1,
  watching: true,
  link: {
    url: "https://example.invalid/sample/repository/pull/1",
    source: "manual" as const,
    ...metadata,
  },
});

describe("repository URL metadata through public nested watch link dispatch", () => {
  let server: FakeT3Server;
  let connection: RpcConnection;
  let threads: ThreadsApi;
  let dispatched: unknown[];
  beforeEach(async () => {
    server = await FakeT3Server.start();
    dispatched = [];
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
    server.handle("orchestration.dispatchCommand", (payload) => {
      dispatched.push(payload);
      return { kind: "value", value: { sequence: 7 } };
    });
  });
  afterEach(async () => {
    await connection.close();
    await server.close();
  });

  it("sends strings, omission and unknown metadata unchanged over RPC", async () => {
    for (const metadata of [
      {},
      { repositoryWebUrl: "https://example.invalid/sample/repository" },
      { repositoryWebUrl: "ssh://git@example.invalid/sample/repository.git" },
      { repositoryWebUrl: "sample" },
    ]) {
      const value = command({ ...metadata, future: "preserved" });
      expect(await threads.dispatch(value)).toEqual({ sequence: 7 });
      expect(dispatched.at(-1)).toEqual(value);
      expect(Object.hasOwn((dispatched.at(-1) as { link: object }).link, "repositoryWebUrl")).toBe(
        Object.hasOwn(metadata, "repositoryWebUrl"),
      );
    }
    expect(server.routes.requests).toEqual([]);
  });

  it("rejects malformed metadata before sending an otherwise valid command", async () => {
    await threads.dispatch(command());
    expect(dispatched).toHaveLength(1);
    dispatched.length = 0;
    for (const repositoryWebUrl of [null, "", " \t ", false, 0, [], {}]) {
      await expect(threads.dispatch(command({ repositoryWebUrl }))).rejects.toBeInstanceOf(
        T3PreconditionError,
      );
      expect(dispatched).toEqual([]);
    }
  });
});
