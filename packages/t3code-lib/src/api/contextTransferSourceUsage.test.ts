// ---
// relationships:
//   verifies: library-wire
// ---
import { afterEach, beforeEach, expect, expectTypeOf, it } from "vite-plus/test";
import { FakeT3Server } from "../../test/support/fakeServer.ts";
import {
  ids,
  at,
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
import type { OrchestrationV2ProviderTurnTokenUsage } from "../schemas/orchestration/providerState.ts";
import { OrchestrationV2ContextTransfer } from "../schemas/orchestration/context.ts";
const usage = { usedTokens: 10, updatedAt: at };
const transfer = (metadata: Record<string, unknown>) => ({
  id: "transfer-1",
  type: "fork",
  sourceThreadId: ids.threadId,
  targetThreadId: "thread-2",
  sourcePoint: { threadId: ids.threadId },
  basePoint: null,
  sourceProviderInstanceId: "sample-provider",
  targetProviderInstanceId: null,
  targetRunId: null,
  status: "pending",
  resolution: null,
  createdBy: "user",
  error: null,
  createdAt: at,
  updatedAt: at,
  consumedAt: null,
  ...metadata,
});
const fullUsage = {
  ...usage,
  maxTokens: null,
  inputTokens: 0,
  cachedInputTokens: 0,
  outputTokens: 0,
  reasoningOutputTokens: 0,
  promptCacheTtlMs: 1,
  autoCompactThreshold: 1,
  promptCacheExpiresAt: "",
  futureUsage: true,
};
const validMetadata = [
  {},
  { sourceTokenUsage: usage },
  { sourceTokenUsage: fullUsage },
  { sourceTokenUsage: { ...fullUsage, maxTokens: 100, promptCacheExpiresAt: at } },
];
const invalidUsage = [
  null,
  false,
  0,
  "sample",
  [],
  {},
  { updatedAt: at },
  { ...usage, usedTokens: -1 },
  { ...usage, usedTokens: 1.5 },
  { ...usage, maxTokens: -1 },
  { ...usage, inputTokens: -1 },
  { ...usage, cachedInputTokens: -1 },
  { ...usage, outputTokens: -1 },
  { ...usage, reasoningOutputTokens: -1 },
  { ...usage, promptCacheTtlMs: 0 },
  { ...usage, autoCompactThreshold: 0 },
  { ...usage, promptCacheExpiresAt: null },
  { ...usage, updatedAt: null },
];
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
it("types source usage and preserves all valid variants, omission and unknown metadata", () => {
  for (const metadata of validMetadata) {
    const parsed = OrchestrationV2ContextTransfer.parse(transfer({ ...metadata, future: true }));
    expectTypeOf(parsed.sourceTokenUsage).toEqualTypeOf<
      OrchestrationV2ProviderTurnTokenUsage | undefined
    >();
    expect(parsed.sourceTokenUsage).toEqual(metadata.sourceTokenUsage);
    expect(Object.hasOwn(parsed, "sourceTokenUsage")).toBe(
      Object.hasOwn(metadata, "sourceTokenUsage"),
    );
    expect(parsed["future"]).toBe(true);
  }
});
it("rejects malformed nested source usage with all other transfer fields valid", () => {
  expect(OrchestrationV2ContextTransfer.safeParse(transfer({})).success).toBe(true);
  for (const sourceTokenUsage of invalidUsage)
    expect(OrchestrationV2ContextTransfer.safeParse(transfer({ sourceTokenUsage })).success).toBe(
      false,
    );
});
it("reads source usage variants and omission through public HTTP detail and RPC projection", async () => {
  for (const metadata of validMetadata) {
    const projection = makeProjection({
      contextTransfers: [transfer({ ...metadata, future: true })],
    });
    server.respond("orchestration.getThreadProjection", projection);
    server.routes.route(`GET /api/orchestration/threads/${ids.threadId}`, () => ({
      status: 200,
      body: makeSnapshot(projection, 1),
    }));
    for (const read of [
      await threads.projection(ids.threadId),
      (await threads.detail(ids.threadId)).projection,
    ]) {
      const parsed = read.contextTransfers[0];
      expect(parsed).toEqual(transfer({ ...metadata, future: true }));
      expectTypeOf(parsed?.sourceTokenUsage).toEqualTypeOf<
        OrchestrationV2ProviderTurnTokenUsage | undefined
      >();
      expect(Object.hasOwn(parsed ?? {}, "sourceTokenUsage")).toBe(
        Object.hasOwn(metadata, "sourceTokenUsage"),
      );
    }
  }
});
it("rejects malformed source usage through HTTP detail and RPC projection", async () => {
  for (const sourceTokenUsage of invalidUsage) {
    const projection = { ...makeProjection(), contextTransfers: [transfer({ sourceTokenUsage })] };
    server.respond("orchestration.getThreadProjection", projection);
    server.routes.route(`GET /api/orchestration/threads/${ids.threadId}`, () => ({
      status: 200,
      body: { snapshotSequence: 1, projection },
    }));
    await expect(threads.projection(ids.threadId)).rejects.toBeInstanceOf(T3DecodeError);
    await expect(threads.detail(ids.threadId)).rejects.toBeInstanceOf(T3DecodeError);
  }
});
it("reports malformed transfer events and recovers with typed source usage and omission", async () => {
  const chunks = [[snapshotItem(1)]];
  let sequence = 2;
  for (const type of ["context-transfer.created", "context-transfer.updated"]) {
    chunks.push([eventItem(sequence++, type, transfer({ sourceTokenUsage: null }))]);
    for (const metadata of validMetadata)
      chunks.push([eventItem(sequence++, type, transfer({ ...metadata, future: true }))]);
  }
  server.handle("orchestration.subscribeThread", () => ({ kind: "stream", chunks }));
  const seen = [];
  for await (const item of threads.watch(ids.threadId)) seen.push(item);
  expect(seen.map((item) => item.kind)).toEqual([
    "snapshot",
    "decode-error",
    "event",
    "event",
    "event",
    "event",
    "decode-error",
    "event",
    "event",
    "event",
    "event",
  ]);
  const events = seen.filter((item) => item.kind === "event");
  for (let i = 0; i < events.length; i++) {
    const event = events[i]?.event;
    if (
      !event ||
      "unknown" in event ||
      (event.type !== "context-transfer.created" && event.type !== "context-transfer.updated")
    )
      throw new Error("Expected context-transfer event");
    const metadata = validMetadata[i % validMetadata.length]!;
    expectTypeOf(event.payload.sourceTokenUsage).toEqualTypeOf<
      OrchestrationV2ProviderTurnTokenUsage | undefined
    >();
    expect(event.payload).toEqual(transfer({ ...metadata, future: true }));
    expect(Object.hasOwn(event.payload, "sourceTokenUsage")).toBe(
      Object.hasOwn(metadata, "sourceTokenUsage"),
    );
  }
});
