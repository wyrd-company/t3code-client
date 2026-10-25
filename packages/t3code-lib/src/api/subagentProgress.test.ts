// ---
// relationships:
//   verifies: library-wire
// ---
import { afterEach, beforeEach, expect, expectTypeOf, it } from "vite-plus/test";
import { FakeT3Server } from "../../test/support/fakeServer.ts";
import {
  ids,
  makeTurnItem,
  makeProjection,
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
import { OrchestrationV2TurnItem } from "../schemas/orchestration/turnItems.ts";
const turnItem = (metadata: Record<string, unknown>) =>
  makeTurnItem("subagent", {
    subagentId: "sample-node",
    origin: "provider_native",
    driver: "sample-provider",
    providerInstanceId: "sample-provider",
    childThreadId: null,
    prompt: "Sample prompt",
    result: null,
    future: true,
    ...metadata,
  });
const validMetadata = [
  {},
  { progress: null },
  { progress: "" },
  { progress: "sample" },
  { progress: "line one\nline two" },
];
const malformed = [false, 0, [], {}];
const projectionFor = (metadata: Record<string, unknown>) => {
  const item = turnItem(metadata);
  return {
    ...makeProjection(),
    turnItems: [item],
    visibleTurnItems: [
      {
        position: 0,
        visibility: "local",
        sourceThreadId: ids.threadId,
        sourceItemId: item["id"],
        item,
      },
    ],
  };
};
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
it("types subagent progress and preserves strings, omission and unknown metadata", () => {
  for (const metadata of validMetadata) {
    const parsed = OrchestrationV2TurnItem.parse(turnItem(metadata));
    if ("unknown" in parsed || parsed.type !== "subagent")
      throw new Error("Expected subagent turn item");
    expectTypeOf(parsed.progress).toEqualTypeOf<string | null | undefined>();
    expect(parsed).toEqual(turnItem(metadata));
    expect(Object.hasOwn(parsed, "progress")).toBe(Object.hasOwn(metadata, "progress"));
  }
});
it("rejects malformed progress with otherwise valid subagents", () => {
  expect(OrchestrationV2TurnItem.safeParse(turnItem({})).success).toBe(true);
  for (const progress of malformed)
    expect(OrchestrationV2TurnItem.safeParse(turnItem({ progress })).success).toBe(false);
});
it("reads subagent progress strings and omission through public HTTP and RPC", async () => {
  for (const metadata of validMetadata) {
    const projection = projectionFor(metadata);
    server.respond("orchestration.getThreadProjection", projection);
    server.routes.route(`GET /api/orchestration/threads/${ids.threadId}`, () => ({
      status: 200,
      body: { snapshotSequence: 1, projection },
    }));
    for (const read of [
      await threads.projection(ids.threadId),
      (await threads.detail(ids.threadId)).projection,
    ]) {
      const item = read.turnItems[0];
      if (!item || item.type !== "subagent") throw new Error("Expected subagent turn item");
      const visible = read.visibleTurnItems[0]?.item;
      expect(visible).toEqual(item);
      const option = item;
      expectTypeOf(option.progress).toEqualTypeOf<string | null | undefined>();
      expect(option).toEqual(turnItem(metadata));
      expect(Object.hasOwn(option!, "progress")).toBe(Object.hasOwn(metadata, "progress"));
    }
  }
});
it("rejects malformed subagent progress through public HTTP and RPC", async () => {
  for (const progress of malformed) {
    const projection = projectionFor({ progress });
    server.respond("orchestration.getThreadProjection", projection);
    server.routes.route(`GET /api/orchestration/threads/${ids.threadId}`, () => ({
      status: 200,
      body: { snapshotSequence: 1, projection },
    }));
    await expect(threads.projection(ids.threadId)).rejects.toBeInstanceOf(T3DecodeError);
    await expect(threads.detail(ids.threadId)).rejects.toBeInstanceOf(T3DecodeError);
  }
});
it("reports malformed subagent events and recovers with typed progress and omission", async () => {
  let sequence = 2;
  const chunks = [[snapshotItem(1)]];
  for (const progress of malformed)
    chunks.push([eventItem(sequence++, "turn-item.updated", turnItem({ progress }))]);
  for (const metadata of validMetadata)
    chunks.push([eventItem(sequence++, "turn-item.updated", turnItem(metadata))]);
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
    if (
      !event ||
      "unknown" in event ||
      event.type !== "turn-item.updated" ||
      "unknown" in event.payload ||
      event.payload.type !== "subagent"
    )
      throw new Error("Expected subagent turn-item event");
    const option = event.payload;
    const metadata = validMetadata[i]!;
    expectTypeOf(option.progress).toEqualTypeOf<string | null | undefined>();
    expect(option).toEqual(turnItem(metadata));
    expect(Object.hasOwn(option!, "progress")).toBe(Object.hasOwn(metadata, "progress"));
  }
});

it("existing stop reads null progress without a projection decode failure", async () => {
  server.respond("orchestration.getThreadProjection", projectionFor({ progress: null }));
  await expect(threads.stop(ids.threadId)).resolves.toBeUndefined();
});
