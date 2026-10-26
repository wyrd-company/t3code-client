// ---
// relationships:
//   verifies: library
// ---
import { afterEach, beforeEach, expect, expectTypeOf, it } from "vite-plus/test";
import { FakeT3Server } from "../../test/support/fakeServer.ts";
import { makeShellSnapshot, makeShellThread } from "../../test/support/threadFixtures.ts";
import { ShellApi } from "./shell.ts";
import { RpcClient } from "../rpc/client.ts";
import { rpcMethods } from "../rpc/registry.ts";
import { HttpTransport } from "../transport/http.ts";
import { RpcConnection } from "../transport/rpcConnection.ts";
import { SocketTransport } from "../transport/socket.ts";
import { T3DecodeError } from "../errors.ts";
import { OrchestrationV2PendingRuntimeRequestSummary } from "../schemas/orchestration/shell.ts";
const request = { id: "request-1", kind: "user_input", createdAt: "2020-01-01T00:00:00.000Z" };
const thread = (metadata: Record<string, unknown>) => ({
  ...makeShellThread(),
  pendingRuntimeRequest: { ...request, ...metadata },
});
let server: FakeT3Server;
let shell: ShellApi;
let connection: RpcConnection;
beforeEach(async () => {
  server = await FakeT3Server.start();
  connection = new RpcConnection(new SocketTransport({ url: async () => server.wsUrl }));
  shell = new ShellApi(
    new HttpTransport({
      baseUrl: server.httpUrl,
      fetch: server.fetch,
      getAccessToken: async () => "sample-token",
    }),
    new RpcClient(connection, rpcMethods),
  );
});
afterEach(async () => {
  await connection.close();
  await server.close();
});
it("types both boolean values and preserves omission and unknown summary metadata", () => {
  for (const blocking of [true, false]) {
    const parsed = OrchestrationV2PendingRuntimeRequestSummary.parse({
      ...request,
      blocking,
      future: 1,
    });
    expectTypeOf(parsed.blocking).toEqualTypeOf<boolean | undefined>();
    expect(parsed.blocking).toBe(blocking);
    expect(parsed["future"]).toBe(1);
  }
  const absent = OrchestrationV2PendingRuntimeRequestSummary.parse(request);
  expect(Object.hasOwn(absent, "blocking")).toBe(false);
  expect(absent.blocking).toBeUndefined();
});
it("rejects malformed blocking while accepting the same summary without it", () => {
  expect(OrchestrationV2PendingRuntimeRequestSummary.safeParse(request).success).toBe(true);
  for (const blocking of [null, "true", 1, {}, []])
    expect(
      OrchestrationV2PendingRuntimeRequestSummary.safeParse({ ...request, blocking }).success,
    ).toBe(false);
});
it("reads true, false and omitted blocking through public HTTP and archived RPC snapshots", async () => {
  for (const metadata of [{ blocking: true }, { blocking: false }, {}]) {
    const raw = { ...makeShellSnapshot({}), threads: [thread(metadata)] };
    server.routes.route("GET /api/orchestration/shell", () => ({ status: 200, body: raw }));
    server.handle("orchestration.getArchivedShellSnapshot", () => ({ kind: "value", value: raw }));
    for (const snapshot of [await shell.snapshot(), await shell.archivedSnapshot()]) {
      const summary = snapshot.threads[0]?.pendingRuntimeRequest;
      expect(summary).toEqual({ ...request, ...metadata });
      expectTypeOf(summary?.blocking).toEqualTypeOf<boolean | undefined>();
      expect(Object.hasOwn(summary ?? {}, "blocking")).toBe(Object.hasOwn(metadata, "blocking"));
    }
  }
});
it("rejects malformed blocking through the public HTTP snapshot", async () => {
  server.routes.route("GET /api/orchestration/shell", () => ({
    status: 200,
    body: { ...makeShellSnapshot({}), threads: [thread({ blocking: "false" })] },
  }));
  await expect(shell.snapshot()).rejects.toBeInstanceOf(T3DecodeError);
});
it("reads blocking through live and archived public shell streams", async () => {
  for (const method of ["orchestration.subscribeShell", "orchestration.subscribeArchivedShell"]) {
    server.handle(method, () => ({
      kind: "stream",
      chunks: [
        [true, false].map((blocking, index) => ({
          kind: "thread.updated",
          sequence: index + 1,
          location: "active",
          thread: thread({ blocking }),
        })),
      ],
    }));
    const values: (boolean | undefined)[] = [];
    const watch = method === "orchestration.subscribeShell" ? shell.watch() : shell.watchArchived();
    for await (const item of watch) {
      if (item.kind === "thread.updated") {
        values.push(item.thread.pendingRuntimeRequest?.blocking);
        if (values.length === 2) break;
      }
    }
    expect(values).toEqual([true, false]);
  }
});
