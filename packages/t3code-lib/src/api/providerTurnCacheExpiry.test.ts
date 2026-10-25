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
import { OrchestrationV2ProviderTurnTokenUsage } from "../schemas/orchestration/providerState.ts";
const usage = { usedTokens: 10, updatedAt: at };
const providerTurn = (metadata: Record<string, unknown>) => ({
  id: "provider-turn-1",
  providerThreadId: "provider-thread-1",
  nodeId: ids.nodeId,
  runAttemptId: null,
  nativeTurnRef: null,
  ordinal: 1,
  status: "completed",
  startedAt: at,
  completedAt: at,
  tokenUsage: { ...usage, ...metadata },
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
it("types string cache expiry metadata and preserves omission and unknown metadata", () => {
  for (const promptCacheExpiresAt of ["", at, "provider-defined value"]) {
    const parsed = OrchestrationV2ProviderTurnTokenUsage.parse({
      ...usage,
      promptCacheExpiresAt,
      future: true,
    });
    expectTypeOf(parsed.promptCacheExpiresAt).toEqualTypeOf<string | undefined>();
    expect(parsed.promptCacheExpiresAt).toBe(promptCacheExpiresAt);
    expect(parsed["future"]).toBe(true);
  }
  const parsed = OrchestrationV2ProviderTurnTokenUsage.parse(usage);
  expect(Object.hasOwn(parsed, "promptCacheExpiresAt")).toBe(false);
});
it("rejects malformed cache expiry metadata with all other usage fields valid", () => {
  expect(OrchestrationV2ProviderTurnTokenUsage.safeParse(usage).success).toBe(true);
  for (const promptCacheExpiresAt of [0, -1, 1.5, null, true, {}, []])
    expect(
      OrchestrationV2ProviderTurnTokenUsage.safeParse({ ...usage, promptCacheExpiresAt }).success,
    ).toBe(false);
});
it("reads cache expiry and omission through public HTTP detail and RPC projection", async () => {
  for (const metadata of [
    { promptCacheExpiresAt: "" },
    { promptCacheExpiresAt: at },
    { promptCacheExpiresAt: "provider-defined value" },
    {},
  ]) {
    const projection = makeProjection({
      providerTurns: [providerTurn({ ...metadata, future: true })],
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
      const parsed = read.providerTurns[0]?.tokenUsage;
      expect(parsed).toEqual({ ...usage, ...metadata, future: true });
      expectTypeOf(parsed?.promptCacheExpiresAt).toEqualTypeOf<string | undefined>();
      expect(Object.hasOwn(parsed ?? {}, "promptCacheExpiresAt")).toBe(
        Object.hasOwn(metadata, "promptCacheExpiresAt"),
      );
    }
  }
});
it("rejects malformed cache expiry metadata through HTTP detail and RPC projection", async () => {
  const projection = {
    ...makeProjection(),
    providerTurns: [providerTurn({ promptCacheExpiresAt: null })],
  };
  server.respond("orchestration.getThreadProjection", projection);
  server.routes.route(`GET /api/orchestration/threads/${ids.threadId}`, () => ({
    status: 200,
    body: { snapshotSequence: 1, projection },
  }));
  await expect(threads.projection(ids.threadId)).rejects.toBeInstanceOf(T3DecodeError);
  await expect(threads.detail(ids.threadId)).rejects.toBeInstanceOf(T3DecodeError);
});
it("reports a malformed stream update and recovers with typed usage", async () => {
  server.handle("orchestration.subscribeThread", () => ({
    kind: "stream",
    chunks: [
      [snapshotItem(1)],
      [eventItem(2, "provider-turn.updated", providerTurn({ promptCacheExpiresAt: false }))],
      [
        eventItem(
          3,
          "provider-turn.updated",
          providerTurn({ promptCacheExpiresAt: at, future: true }),
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
    last.event.type !== "provider-turn.updated"
  )
    throw new Error("Expected provider-turn update");
  expectTypeOf(last.event.payload.tokenUsage?.promptCacheExpiresAt).toEqualTypeOf<
    string | undefined
  >();
  expect(last.event.payload.tokenUsage).toEqual({
    ...usage,
    promptCacheExpiresAt: at,
    future: true,
  });
});
