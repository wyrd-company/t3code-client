// ---
// relationships:
//   verifies: library-wire
// ---
import { afterEach, beforeEach, expect, expectTypeOf, it } from "vite-plus/test";
import { FakeT3Server } from "../../test/support/fakeServer.ts";
import {
  ids,
  makeProjection,
  makeSnapshot,
  eventItem,
  snapshotItem,
  at,
} from "../../test/support/threadFixtures.ts";
import { RpcClient } from "../rpc/client.ts";
import { rpcMethods } from "../rpc/registry.ts";
import { HttpTransport } from "../transport/http.ts";
import { RpcConnection } from "../transport/rpcConnection.ts";
import { SocketTransport } from "../transport/socket.ts";
import { CommandDispatcher } from "./dispatch.ts";
import { ThreadsApi } from "./threads.ts";
import { T3DecodeError } from "../errors.ts";
import { OrchestrationV2ProviderThreadNativeMetadata } from "../schemas/orchestration/providerState.ts";

const validMetadata = [
  {},
  { forkHeadMessageId: "sample-head" },
  { forkHeadMessageId: " future-head " },
];
const malformed = ["", "   ", null, false, 0, [], {}];
const metadataRecord = (metadata: Record<string, unknown>) => ({ future: true, ...metadata });
const expectedMetadata = (metadata: Record<string, unknown>) => ({
  future: true,
  ...("forkHeadMessageId" in metadata
    ? { forkHeadMessageId: (metadata["forkHeadMessageId"] as string).trim() }
    : {}),
});
const providerThread = (metadata: Record<string, unknown>) => ({
  id: "provider-thread-1",
  driver: "sample-provider",
  providerInstanceId: "sample-provider",
  providerSessionId: null,
  appThreadId: ids.threadId,
  ownerNodeId: null,
  nativeThreadRef: null,
  nativeConversationHeadRef: null,
  status: "idle",
  firstRunOrdinal: null,
  lastRunOrdinal: null,
  handoffIds: [],
  forkedFrom: null,
  pendingBackgroundTasks: [],
  contextUsage: null,
  goal: null,
  nativeMetadata: metadataRecord(metadata),
  createdAt: at,
  updatedAt: at,
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
it("types native fork heads and preserves trimmed strings, omission and unknown metadata", () => {
  for (const metadata of validMetadata) {
    const parsed = OrchestrationV2ProviderThreadNativeMetadata.parse(metadataRecord(metadata));
    expectTypeOf(parsed.forkHeadMessageId).toEqualTypeOf<string | undefined>();
    expect(parsed).toEqual(expectedMetadata(metadata));
    expect(Object.hasOwn(parsed, "forkHeadMessageId")).toBe(
      Object.hasOwn(metadata, "forkHeadMessageId"),
    );
  }
});
it("rejects malformed fork heads with otherwise valid native metadata", () => {
  expect(OrchestrationV2ProviderThreadNativeMetadata.safeParse(metadataRecord({})).success).toBe(
    true,
  );
  for (const forkHeadMessageId of malformed)
    expect(
      OrchestrationV2ProviderThreadNativeMetadata.safeParse(metadataRecord({ forkHeadMessageId }))
        .success,
    ).toBe(false);
});
it("reads native fork heads and omission through public HTTP and RPC", async () => {
  for (const metadata of validMetadata) {
    const projection = makeProjection({ providerThreads: [providerThread(metadata)] });
    server.respond("orchestration.getThreadProjection", projection);
    server.routes.route(`GET /api/orchestration/threads/${ids.threadId}`, () => ({
      status: 200,
      body: makeSnapshot(projection, 1),
    }));
    for (const read of [
      await threads.projection(ids.threadId),
      (await threads.detail(ids.threadId)).projection,
    ]) {
      const parsed = read.providerThreads[0]?.nativeMetadata;
      expectTypeOf(parsed?.forkHeadMessageId).toEqualTypeOf<string | undefined>();
      expect(parsed).toEqual(expectedMetadata(metadata));
      expect(Object.hasOwn(parsed!, "forkHeadMessageId")).toBe(
        Object.hasOwn(metadata, "forkHeadMessageId"),
      );
    }
  }
});
it("rejects malformed native fork heads through public HTTP and RPC", async () => {
  for (const forkHeadMessageId of malformed) {
    const projection = {
      ...makeProjection(),
      providerThreads: [providerThread({ forkHeadMessageId })],
    };
    server.respond("orchestration.getThreadProjection", projection);
    server.routes.route(`GET /api/orchestration/threads/${ids.threadId}`, () => ({
      status: 200,
      body: { snapshotSequence: 1, projection },
    }));
    await expect(threads.projection(ids.threadId)).rejects.toBeInstanceOf(T3DecodeError);
    await expect(threads.detail(ids.threadId)).rejects.toBeInstanceOf(T3DecodeError);
  }
});
it("reports malformed provider-thread events and recovers with typed fork heads and omission", async () => {
  let sequence = 2;
  const chunks = [[snapshotItem(1)]];
  for (const forkHeadMessageId of malformed)
    chunks.push([
      eventItem(sequence++, "provider-thread.updated", providerThread({ forkHeadMessageId })),
    ]);
  for (const metadata of validMetadata)
    chunks.push([eventItem(sequence++, "provider-thread.updated", providerThread(metadata))]);
  server.handle("orchestration.subscribeThread", () => ({ kind: "stream", chunks }));
  const seen = [];
  for await (const item of threads.watch(ids.threadId)) seen.push(item);
  expect(seen.map((item) => item.kind)).toEqual([
    "snapshot",
    ...malformed.map(() => "decode-error"),
    ...validMetadata.map(() => "event"),
  ]);
  const events = seen.filter((item) => item.kind === "event");
  for (let i = 0; i < events.length; i++) {
    const event = events[i]?.event;
    if (!event || "unknown" in event || event.type !== "provider-thread.updated")
      throw new Error("Expected provider thread event");
    const parsed = event.payload.nativeMetadata;
    const metadata = validMetadata[i]!;
    expectTypeOf(parsed?.forkHeadMessageId).toEqualTypeOf<string | undefined>();
    expect(parsed).toEqual(expectedMetadata(metadata));
    expect(Object.hasOwn(parsed!, "forkHeadMessageId")).toBe(
      Object.hasOwn(metadata, "forkHeadMessageId"),
    );
  }
});
