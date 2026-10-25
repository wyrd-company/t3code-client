// ---
// relationships:
//   verifies: library-wire
// ---
import { afterEach, beforeEach, expect, expectTypeOf, it } from "vite-plus/test";
import { FakeT3Server } from "../../test/support/fakeServer.ts";
import { ids, makeProjection, eventItem, at } from "../../test/support/threadFixtures.ts";
import { RpcClient } from "../rpc/client.ts";
import { rpcMethods } from "../rpc/registry.ts";
import { HttpTransport } from "../transport/http.ts";
import { RpcConnection } from "../transport/rpcConnection.ts";
import { SocketTransport } from "../transport/socket.ts";
import { CommandDispatcher } from "./dispatch.ts";
import { ThreadsApi } from "./threads.ts";
import { T3DecodeError } from "../errors.ts";

import { ThreadTokenUsageSnapshot } from "../schemas/orchestration/providerRuntime.ts";
const valid: Record<string, unknown>[] = [
  {},
  { cost: { amount: 0, currency: "sample", futureCost: true } },
  { cost: { amount: -0.5, currency: " arbitrary currency " } },
  { cost: { amount: 1.25, currency: "x".repeat(32) } },
  { cost: { amount: Number.MAX_VALUE, currency: "x" } },
];
const malformed = [
  null,
  false,
  1,
  "sample",
  [],
  {},
  { amount: 1 },
  { currency: "sample" },
  ...[null, false, "1", [], {}, Infinity, -Infinity, NaN].map((amount) => ({
    amount,
    currency: "sample",
  })),
  ...[null, false, 1, [], {}, "", "   ", "x".repeat(33)].map((currency) => ({
    amount: 1,
    currency,
  })),
];
const expectedUsage = (metadata: Record<string, unknown>) =>
  ThreadTokenUsageSnapshot.parse({ usedTokens: 1, futureUsage: true, ...metadata });
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
  contextUsage: { usedTokens: 1, futureUsage: true, ...metadata },
  goal: null,
  nativeMetadata: null,
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

it("types cost, trims currency and preserves finite amounts, omission and unknown metadata", () => {
  for (const metadata of valid) {
    const parsed = ThreadTokenUsageSnapshot.parse({
      usedTokens: 1,
      futureUsage: true,
      ...metadata,
    });
    expectTypeOf(parsed.cost).toEqualTypeOf<
      { [key: string]: unknown; amount: number; currency: string } | undefined
    >();
    const cost = metadata["cost"] as { amount: number; currency: string } | undefined;
    expect(parsed.cost).toEqual(cost ? { ...cost, currency: cost.currency.trim() } : undefined);
    expect(Object.hasOwn(parsed, "cost")).toBe(Object.hasOwn(metadata, "cost"));
    expect(parsed["futureUsage"]).toBe(true);
  }
});
it("rejects malformed cost and each nested value with otherwise valid usage", () => {
  expect(ThreadTokenUsageSnapshot.safeParse({ usedTokens: 1 }).success).toBe(true);
  for (const cost of malformed)
    expect(ThreadTokenUsageSnapshot.safeParse({ usedTokens: 1, cost }).success).toBe(false);
});
it("reads cost through HTTP detail and RPC projection and preserves omission", async () => {
  for (const metadata of valid) {
    const projection = { ...makeProjection(), providerThreads: [providerThread(metadata)] };
    server.respond("orchestration.getThreadProjection", projection);
    server.routes.route(`GET /api/orchestration/threads/${ids.threadId}`, () => ({
      status: 200,
      body: { snapshotSequence: 1, projection },
    }));
    for (const read of [
      await threads.projection(ids.threadId),
      (await threads.detail(ids.threadId)).projection,
    ]) {
      const usage = read.providerThreads[0]!.contextUsage!;
      expectTypeOf(usage.cost).toEqualTypeOf<
        { [key: string]: unknown; amount: number; currency: string } | undefined
      >();
      expect(usage).toEqual(expectedUsage(metadata));
      expect(Object.hasOwn(usage, "cost")).toBe(Object.hasOwn(metadata, "cost"));
    }
  }
});
it("rejects malformed cost through both public read transports", async () => {
  // JSON transports cannot carry nonfinite numbers: schema tests cover those directly.
  for (const cost of malformed) {
    const projection = { ...makeProjection(), providerThreads: [providerThread({ cost })] };
    server.respond("orchestration.getThreadProjection", projection);
    server.routes.route(`GET /api/orchestration/threads/${ids.threadId}`, () => ({
      status: 200,
      body: { snapshotSequence: 1, projection },
    }));
    await expect(threads.projection(ids.threadId)).rejects.toBeInstanceOf(T3DecodeError);
    await expect(threads.detail(ids.threadId)).rejects.toBeInstanceOf(T3DecodeError);
  }
});
it("reports malformed snapshots and provider updates then preserves later valid cost", async () => {
  let sequence = 1;
  const snapshot = (metadata: Record<string, unknown>) => ({
    kind: "snapshot",
    snapshotSequence: sequence++,
    projection: { ...makeProjection(), providerThreads: [providerThread(metadata)] },
  });
  const chunks: unknown[][] = [];
  for (const cost of malformed) chunks.push([snapshot({ cost })]);
  for (const metadata of valid) chunks.push([snapshot(metadata)]);
  for (const cost of malformed)
    chunks.push([eventItem(sequence++, "provider-thread.updated", providerThread({ cost }))]);
  for (const metadata of valid)
    chunks.push([eventItem(sequence++, "provider-thread.updated", providerThread(metadata))]);
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
    if (!event || "unknown" in event || event.type !== "provider-thread.updated")
      throw new Error("Expected provider update");
    expectTypeOf(event.payload.contextUsage!.cost).toEqualTypeOf<
      { [key: string]: unknown; amount: number; currency: string } | undefined
    >();
    for (const usage of [
      snapshots[i]!.snapshot.projection.providerThreads[0]!.contextUsage!,
      event.payload.contextUsage!,
    ]) {
      expect(usage).toEqual(expectedUsage(valid[i]!));
      expect(Object.hasOwn(usage, "cost")).toBe(Object.hasOwn(valid[i]!, "cost"));
    }
  }
});
