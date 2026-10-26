// ---
// relationships:
//   verifies: library-facades
// ---
import { afterEach, beforeEach, expect, expectTypeOf, it } from "vite-plus/test";
import { FakeT3Server } from "../../test/support/fakeServer.ts";
import {
  ids,
  makeAppThread,
  makeProjection,
  eventItem,
} from "../../test/support/threadFixtures.ts";
import { RpcClient } from "../rpc/client.ts";
import { rpcMethods } from "../rpc/registry.ts";
import { HttpTransport } from "../transport/http.ts";
import { RpcConnection } from "../transport/rpcConnection.ts";
import { SocketTransport } from "../transport/socket.ts";
import { CommandDispatcher } from "./dispatch.ts";
import { ThreadsApi } from "./threads.ts";
import { T3DecodeError } from "../errors.ts";
import { OrchestrationV2AppThread } from "../schemas/orchestration/thread.ts";

const valid = [{}, { lastSnoozeWakeAt: null }, { lastSnoozeWakeAt: "2026-01-01T00:00:00.000Z" }];
const malformed = [false, 0, [], {}];
const appThread = (metadata: Record<string, unknown>) =>
  makeAppThread({ future: { retained: true }, ...metadata });
const projection = (metadata: Record<string, unknown>) => ({
  ...makeProjection(),
  thread: appThread(metadata),
});
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
it("types optional nullable app-thread wake timestamps and preserves unknown metadata", () => {
  for (const metadata of valid) {
    const parsed = OrchestrationV2AppThread.parse(appThread(metadata));
    expectTypeOf(parsed.lastSnoozeWakeAt).toEqualTypeOf<string | null | undefined>();
    expect(parsed).toMatchObject(appThread(metadata));
    expect(Object.hasOwn(parsed, "lastSnoozeWakeAt")).toBe(
      Object.hasOwn(metadata, "lastSnoozeWakeAt"),
    );
  }
});
it("rejects nonstring nonnull app-thread wake metadata", () => {
  expect(OrchestrationV2AppThread.safeParse(appThread({})).success).toBe(true);
  for (const lastSnoozeWakeAt of malformed)
    expect(OrchestrationV2AppThread.safeParse(appThread({ lastSnoozeWakeAt })).success).toBe(false);
});
it("reads app-thread wake timestamp, null and omission through public detail and projection", async () => {
  for (const metadata of valid) {
    const value = projection(metadata);
    server.respond("orchestration.getThreadProjection", value);
    server.routes.route(`GET /api/orchestration/threads/${ids.threadId}`, () => ({
      status: 200,
      body: { snapshotSequence: 1, projection: value },
    }));
    for (const read of [
      await threads.projection(ids.threadId),
      (await threads.detail(ids.threadId)).projection,
    ]) {
      expectTypeOf(read.thread.lastSnoozeWakeAt).toEqualTypeOf<string | null | undefined>();
      expect(read.thread).toMatchObject(appThread(metadata));
      expect(Object.hasOwn(read.thread, "lastSnoozeWakeAt")).toBe(
        Object.hasOwn(metadata, "lastSnoozeWakeAt"),
      );
    }
  }
});
it("rejects malformed app-thread wake metadata through public detail and projection", async () => {
  for (const lastSnoozeWakeAt of malformed) {
    const value = projection({ lastSnoozeWakeAt });
    server.respond("orchestration.getThreadProjection", value);
    server.routes.route(`GET /api/orchestration/threads/${ids.threadId}`, () => ({
      status: 200,
      body: { snapshotSequence: 1, projection: value },
    }));
    await expect(threads.projection(ids.threadId)).rejects.toBeInstanceOf(T3DecodeError);
    await expect(threads.detail(ids.threadId)).rejects.toBeInstanceOf(T3DecodeError);
  }
});
it("reports malformed snapshots and thread updates and keeps later valid app-thread metadata", async () => {
  let sequence = 1;
  const snapshot = (metadata: Record<string, unknown>) => ({
    kind: "snapshot",
    snapshotSequence: sequence++,
    projection: projection(metadata),
  });
  const chunks: unknown[][] = [];
  for (const lastSnoozeWakeAt of malformed) chunks.push([snapshot({ lastSnoozeWakeAt })]);
  for (const metadata of valid) chunks.push([snapshot(metadata)]);
  for (const lastSnoozeWakeAt of malformed)
    chunks.push([
      eventItem(sequence++, "thread.metadata-updated", appThread({ lastSnoozeWakeAt })),
    ]);
  for (const metadata of valid)
    chunks.push([eventItem(sequence++, "thread.metadata-updated", appThread(metadata))]);
  server.handle("orchestration.subscribeThread", () => ({ kind: "stream", chunks }));
  const seen = [];
  for await (const item of threads.watch(ids.threadId)) seen.push(item);
  expect(seen.map((item) => item.kind)).toEqual([
    ...malformed.map(() => "decode-error"),
    ...valid.map(() => "snapshot"),
    ...malformed.map(() => "decode-error"),
    ...valid.map(() => "event"),
  ]);
  const snapshots = seen.filter((item) => item.kind === "snapshot");
  const updates = seen.filter((item) => item.kind === "event");
  for (let i = 0; i < valid.length; i++) {
    const event = updates[i]?.event;
    if (!event || "unknown" in event || event.type !== "thread.metadata-updated")
      throw new Error("Expected thread update");
    expectTypeOf(event.payload.lastSnoozeWakeAt).toEqualTypeOf<string | null | undefined>();
    for (const row of [snapshots[i]!.snapshot.projection.thread, event.payload]) {
      expect(row).toMatchObject(appThread(valid[i]!));
      expect(Object.hasOwn(row, "lastSnoozeWakeAt")).toBe(
        Object.hasOwn(valid[i]!, "lastSnoozeWakeAt"),
      );
    }
  }
});
