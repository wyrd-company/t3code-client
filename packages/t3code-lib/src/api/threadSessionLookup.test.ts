// ---
// relationships:
//   verifies: library-facades
// ---
import { afterEach, beforeEach, expect, it } from "vite-plus/test";
import { FakeT3Server } from "../../test/support/fakeServer.ts";
import {
  at,
  makeAppThread,
  makeProjection,
  makeSnapshot,
  makeShellSnapshot,
  makeShellThread,
} from "../../test/support/threadFixtures.ts";
import { T3HttpError, T3PreconditionError, T3RpcError } from "../errors.ts";
import { RpcClient } from "../rpc/client.ts";
import { rpcMethods } from "../rpc/registry.ts";
import { providerInstanceId, threadId } from "../schemas/common.ts";
import { HttpTransport } from "../transport/http.ts";
import { RpcConnection } from "../transport/rpcConnection.ts";
import { SocketTransport } from "../transport/socket.ts";
import { CommandDispatcher } from "./dispatch.ts";
import { ThreadsApi } from "./threads.ts";

const provider = providerInstanceId("sample-provider");
const nativeId = "native-session-1";
function providerThread(overrides: Record<string, unknown> = {}) {
  return {
    id: "provider-thread-1",
    driver: "sample-driver",
    providerInstanceId: provider,
    providerSessionId: "runtime-session-1",
    appThreadId: "thread-1",
    ownerNodeId: null,
    nativeThreadRef: { driver: "sample-driver", nativeId, strength: "strong" },
    nativeConversationHeadRef: null,
    status: "idle",
    firstRunOrdinal: 1,
    lastRunOrdinal: 1,
    handoffIds: [],
    forkedFrom: null,
    createdAt: at,
    updatedAt: at,
    ...overrides,
  };
}
function respondDetail(projection: ReturnType<typeof makeProjection>) {
  server.routes.route(`GET /api/orchestration/threads/${projection.thread.id}`, () => ({
    status: 200,
    body: makeSnapshot(projection, 1),
  }));
}
let server: FakeT3Server;
let connection: RpcConnection;
let threads: ThreadsApi;
beforeEach(async () => {
  server = await FakeT3Server.start();
  connection = new RpcConnection(new SocketTransport({ url: async () => server.wsUrl }));
  const rpc = new RpcClient(connection, rpcMethods);
  threads = new ThreadsApi(
    new HttpTransport({
      baseUrl: server.httpUrl,
      fetch: server.fetch,
      getAccessToken: async () => "token-1",
    }),
    rpc,
    new CommandDispatcher(rpc),
  );
  server.routes.route("GET /api/orchestration/shell", () => ({
    status: 200,
    body: makeShellSnapshot({ threads: [makeShellThread()] }),
  }));
  server.respond("orchestration.getArchivedShellSnapshot", {
    schemaVersion: 2,
    snapshotSequence: 1,
    projects: [],
    threads: [],
  });
  respondDetail(
    makeProjection({
      providerThreads: [providerThread()],
    }),
  );
});
afterEach(async () => {
  await connection.close();
  await server.close();
});

it("resolves the native session with the exact provider instance", async () => {
  expect(await threads.findByNativeSession(provider, nativeId)).toBe("thread-1");
  expect(
    await threads.findByNativeSession(providerInstanceId("other-provider"), nativeId),
  ).toBeNull();
  expect(
    await threads.findByNativeSession(providerInstanceId("sample-driver"), nativeId),
  ).toBeNull();
});

it("does not treat runtime session ids, conversation heads or absent native refs as sessions", async () => {
  respondDetail(
    makeProjection({
      providerThreads: [
        providerThread({
          nativeThreadRef: null,
          nativeConversationHeadRef: { driver: "sample-driver", nativeId, strength: "strong" },
        }),
      ],
    }),
  );
  expect(await threads.findByNativeSession(provider, nativeId)).toBeNull();
  expect(await threads.findByNativeSession(provider, "runtime-session-1")).toBeNull();
});

it("resolves an earlier session outside the bounded RPC window after a switch and detachment", async () => {
  server.respond("orchestration.getThreadProjection", makeProjection({ providerThreads: [] }));
  expect((await threads.projection(threadId("thread-1"))).providerThreads).toEqual([]);
  server.routes.route("GET /api/orchestration/shell", () => ({
    status: 200,
    body: makeShellSnapshot({
      threads: [
        makeShellThread({
          providerInstanceId: "other-provider",
          providerInstanceHistory: [],
          modelSelection: { instanceId: "other-provider", model: "sample-model" },
        }),
      ],
    }),
  }));
  respondDetail(
    makeProjection({
      thread: makeAppThread({
        providerInstanceId: "other-provider",
        modelSelection: { instanceId: "other-provider", model: "sample-model" },
      }),
      providerThreads: [
        providerThread({ providerSessionId: null, status: "closed" }),
        providerThread({ id: "provider-thread-2", providerInstanceId: "other-provider" }),
      ],
    }),
  );
  expect(await threads.findByNativeSession(provider, nativeId)).toBe("thread-1");
});

it("searches the archived RPC shell as well as active threads", async () => {
  const archived = makeShellThread({ id: "thread-archived", archivedAt: at });
  server.respond("orchestration.getArchivedShellSnapshot", {
    schemaVersion: 2,
    snapshotSequence: 1,
    projects: [],
    threads: [archived],
  });
  for (const id of ["thread-1", "thread-archived"]) {
    respondDetail(
      makeProjection({
        thread: makeAppThread({ id, archivedAt: id === archived.id ? at : null }),
        providerThreads: id === archived.id ? [providerThread({ appThreadId: id })] : [],
      }),
    );
  }
  expect(await threads.findByNativeSession(provider, nativeId)).toBe(archived.id);
});

it("returns null on a complete search with no match or no threads", async () => {
  expect(await threads.findByNativeSession(provider, "missing-session")).toBeNull();
  server.routes.route("GET /api/orchestration/shell", () => ({
    status: 200,
    body: makeShellSnapshot({ threads: [] }),
  }));
  expect(await threads.findByNativeSession(provider, nativeId)).toBeNull();
});

it("ignores records owned by another thread and deleted threads", async () => {
  respondDetail(
    makeProjection({
      providerThreads: [providerThread({ appThreadId: "another-thread" })],
    }),
  );
  expect(await threads.findByNativeSession(provider, nativeId)).toBeNull();
  respondDetail(
    makeProjection({
      thread: makeAppThread({ deletedAt: at }),
      providerThreads: [providerThread()],
    }),
  );
  expect(await threads.findByNativeSession(provider, nativeId)).toBeNull();
});

it("rejects matches in different threads instead of choosing one", async () => {
  server.routes.route("GET /api/orchestration/shell", () => ({
    status: 200,
    body: makeShellSnapshot({
      threads: [makeShellThread(), makeShellThread({ id: "thread-2" })],
    }),
  }));
  for (const id of ["thread-1", "thread-2"]) {
    respondDetail(
      makeProjection({
        thread: makeAppThread({ id }),
        providerThreads: [providerThread({ appThreadId: id })],
      }),
    );
  }
  await expect(threads.findByNativeSession(provider, nativeId)).rejects.toThrow(
    "matches more than one T3 Code thread",
  );
});

it("ignores a thread the shell marks deleted", async () => {
  server.routes.route("GET /api/orchestration/shell", () => ({
    status: 200,
    body: makeShellSnapshot({ threads: [makeShellThread({ deletedAt: at })] }),
  }));
  expect(await threads.findByNativeSession(provider, nativeId)).toBeNull();
});

it("separates equal native ids in different provider instances", async () => {
  server.routes.route("GET /api/orchestration/shell", () => ({
    status: 200,
    body: makeShellSnapshot({ threads: [makeShellThread(), makeShellThread({ id: "thread-2" })] }),
  }));
  for (const id of ["thread-1", "thread-2"]) {
    respondDetail(
      makeProjection({
        thread: makeAppThread({ id }),
        providerThreads: [
          providerThread({
            appThreadId: id,
            providerInstanceId: id === "thread-1" ? provider : "other-provider",
          }),
        ],
      }),
    );
  }
  expect(await threads.findByNativeSession(provider, nativeId)).toBe("thread-1");
  expect(await threads.findByNativeSession(providerInstanceId("other-provider"), nativeId)).toBe(
    "thread-2",
  );
});

it("accepts repeated matching provider records in the same app thread", async () => {
  respondDetail(
    makeProjection({
      providerThreads: [providerThread(), providerThread({ id: "provider-thread-2" })],
    }),
  );
  expect(await threads.findByNativeSession(provider, nativeId)).toBe("thread-1");
});

it("does not turn archive or detail failures into null, even after a match", async () => {
  server.handle("orchestration.getArchivedShellSnapshot", () => ({
    kind: "fail",
    error: { _tag: "SampleReadError", message: "sample failure" },
  }));
  await expect(threads.findByNativeSession(provider, nativeId)).rejects.toBeInstanceOf(T3RpcError);
  server.respond("orchestration.getArchivedShellSnapshot", {
    schemaVersion: 2,
    snapshotSequence: 1,
    projects: [],
    threads: [makeShellThread({ id: "thread-2" })],
  });
  server.routes.route("GET /api/orchestration/threads/thread-2", () => ({
    status: 500,
    body: { reason: "sample_read_failed" },
  }));
  await expect(threads.findByNativeSession(provider, nativeId)).rejects.toBeInstanceOf(T3HttpError);
});

it.each([
  ["", nativeId],
  ["invalid provider", nativeId],
  [provider, " "],
])("validates lookup inputs before connecting: %s / %s", async (instance, session) => {
  await expect(
    threads.findByNativeSession(providerInstanceId(instance!), session!),
  ).rejects.toBeInstanceOf(T3PreconditionError);
  expect(server.routes.requests).toHaveLength(0);
  expect(server.connections).toHaveLength(0);
});
