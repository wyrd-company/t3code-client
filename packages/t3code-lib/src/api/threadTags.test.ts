import { afterEach, beforeEach, describe, expect, it } from "vite-plus/test";
import { FakeT3Server } from "../../test/support/fakeServer.ts";
import { ids, makeShellSnapshot, makeShellThread } from "../../test/support/threadFixtures.ts";
import { RpcClient } from "../rpc/client.ts";
import { rpcMethods } from "../rpc/registry.ts";
import type { OrchestrationV2ThreadShell } from "../schemas/orchestration/shell.ts";
import { HttpTransport } from "../transport/http.ts";
import { RpcConnection } from "../transport/rpcConnection.ts";
import { SocketTransport } from "../transport/socket.ts";
import { CommandDispatcher } from "./dispatch.ts";
import { ThreadsApi } from "./threads.ts";

describe("ThreadsApi: thread tags", () => {
  let server: FakeT3Server;
  let connection: RpcConnection;
  let threads: ThreadsApi;
  let shellThreads: OrchestrationV2ThreadShell[];
  let archivedThreads: OrchestrationV2ThreadShell[];
  let dispatched: Record<string, unknown>[];

  beforeEach(async () => {
    server = await FakeT3Server.start();
    shellThreads = [
      makeShellThread(),
      makeShellThread({ id: "thread-2", tags: ["alpha", "beta"] }),
      makeShellThread({ id: "thread-3", tags: ["Alpha"] }),
    ];
    archivedThreads = [makeShellThread({ id: "thread-archived", tags: ["alpha"] })];
    dispatched = [];
    connection = new RpcConnection(new SocketTransport({ url: async () => server.wsUrl }));
    const rpc = new RpcClient(connection, rpcMethods);
    const http = new HttpTransport({
      baseUrl: server.httpUrl,
      fetch: server.fetch,
      getAccessToken: async () => "token-1",
    });
    threads = new ThreadsApi(http, rpc, new CommandDispatcher(rpc));
    server.routes.route("GET /api/orchestration/shell", () => ({
      status: 200,
      body: makeShellSnapshot({ threads: shellThreads, archivedThreads }),
    }));
    server.handle("orchestration.dispatchCommand", (payload) => {
      const command = payload as Record<string, unknown>;
      dispatched.push(command);
      const thread = shellThreads.find((t) => t.id === command["threadId"]);
      if (thread && command["type"] === "thread.tag.set") {
        const current = thread.tags ?? [];
        const tag = command["tag"] as string;
        thread.tags = command["tagged"]
          ? current.includes(tag)
            ? current
            : [...current, tag]
          : current.filter((t) => t !== tag);
      }
      return { kind: "value", value: { sequence: dispatched.length } };
    });
  });
  afterEach(async () => {
    await connection.close();
    await server.close();
  });

  it("setTag dispatches thread.tag.set with a trimmed tag and returns the tags read back", async () => {
    expect(await threads.setTag(ids.threadId, "  alpha ", true)).toEqual(["alpha"]);
    expect(await threads.setTag(ids.threadId, "gamma", true)).toEqual(["alpha", "gamma"]);
    expect(await threads.setTag(ids.threadId, "alpha", false)).toEqual(["gamma"]);
    expect(dispatched).toMatchObject([
      { type: "thread.tag.set", threadId: ids.threadId, tag: "alpha", tagged: true },
      { type: "thread.tag.set", threadId: ids.threadId, tag: "gamma", tagged: true },
      { type: "thread.tag.set", threadId: ids.threadId, tag: "alpha", tagged: false },
    ]);
    expect(new Set(dispatched.map((c) => c["commandId"])).size).toBe(3);
  });

  it("setTag rejects a malformed tag before sending", async () => {
    await expect(threads.setTag(ids.threadId, "  ", true)).rejects.toThrow();
    await expect(threads.setTag(ids.threadId, "a".repeat(65), true)).rejects.toThrow();
    await expect(threads.setTag(ids.threadId, "two\nlines", true)).rejects.toThrow();
    expect(dispatched).toEqual([]);
  });

  it("setTag fails when the thread is not in the shell afterwards", async () => {
    await expect(threads.setTag(ids.threadId, "alpha", true)).resolves.toEqual(["alpha"]);
    shellThreads = [];
    await expect(threads.setTag(ids.threadId, "alpha", true)).rejects.toMatchObject({
      code: "precondition",
    });
  });

  it("list filters by exact tag after trimming, with archived threads on request", async () => {
    expect((await threads.list({ tag: " alpha " })).map((t) => t.id)).toEqual(["thread-2"]);
    expect((await threads.list({ tag: "Alpha" })).map((t) => t.id)).toEqual(["thread-3"]);
    expect((await threads.list({ tag: "alpha", includeArchived: true })).map((t) => t.id)).toEqual([
      "thread-2",
      "thread-archived",
    ]);
    expect(await threads.list({ tag: "missing" })).toEqual([]);
  });
});
