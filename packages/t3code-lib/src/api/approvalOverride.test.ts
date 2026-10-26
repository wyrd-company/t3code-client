// ---
// relationships:
//   verifies: library-wire
// ---
import { afterEach, beforeEach, expect, expectTypeOf, it } from "vite-plus/test";
import { FakeT3Server } from "../../test/support/fakeServer.ts";
import {
  ids,
  items,
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
import { OrchestrationV2TurnItem } from "../schemas/orchestration/turnItems.ts";
import type { KnownOr } from "../schemas/common.ts";
const turnItem = (metadata: Record<string, unknown>) =>
  items.approvalRequest("request-1", { future: true, ...metadata });
const validMetadata = [
  {},
  { fullAccessOverride: "ask_rule" },
  { fullAccessOverride: "provider_check" },
  { fullAccessOverride: "future_override" },
];
const malformed = [null, false, 0, [], {}];
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
it("types approval-request fullAccessOverrides and preserves strings, omission and unknown metadata", () => {
  for (const metadata of validMetadata) {
    const parsed = OrchestrationV2TurnItem.parse(turnItem(metadata));
    if ("unknown" in parsed || parsed.type !== "approval_request")
      throw new Error("Expected approval turn item");
    expectTypeOf(parsed.fullAccessOverride).toEqualTypeOf<
      KnownOr<"ask_rule" | "provider_check"> | undefined
    >();
    expect(parsed).toEqual(turnItem(metadata));
    expect(Object.hasOwn(parsed, "fullAccessOverride")).toBe(
      Object.hasOwn(metadata, "fullAccessOverride"),
    );
  }
});
it("rejects nonstring fullAccessOverrides with otherwise valid approval-requests", () => {
  expect(OrchestrationV2TurnItem.safeParse(turnItem({})).success).toBe(true);
  for (const fullAccessOverride of malformed)
    expect(OrchestrationV2TurnItem.safeParse(turnItem({ fullAccessOverride })).success).toBe(false);
});
it("reads approval fullAccessOverride strings and omission through public HTTP and RPC", async () => {
  for (const metadata of validMetadata) {
    const projection = makeProjection({ turnItems: [turnItem(metadata)] });
    server.respond("orchestration.getThreadProjection", projection);
    server.routes.route(`GET /api/orchestration/threads/${ids.threadId}`, () => ({
      status: 200,
      body: makeSnapshot(projection, 1),
    }));
    for (const read of [
      await threads.projection(ids.threadId),
      (await threads.detail(ids.threadId)).projection,
    ]) {
      const item = read.turnItems[0];
      if (!item || item.type !== "approval_request") throw new Error("Expected approval turn item");
      const option = item;
      expectTypeOf(option.fullAccessOverride).toEqualTypeOf<
        KnownOr<"ask_rule" | "provider_check"> | undefined
      >();
      expect(option).toEqual(turnItem(metadata));
      expect(Object.hasOwn(option!, "fullAccessOverride")).toBe(
        Object.hasOwn(metadata, "fullAccessOverride"),
      );
    }
  }
});
it("rejects malformed approval fullAccessOverrides through public HTTP and RPC", async () => {
  for (const fullAccessOverride of malformed) {
    const projection = { ...makeProjection(), turnItems: [turnItem({ fullAccessOverride })] };
    server.respond("orchestration.getThreadProjection", projection);
    server.routes.route(`GET /api/orchestration/threads/${ids.threadId}`, () => ({
      status: 200,
      body: { snapshotSequence: 1, projection },
    }));
    await expect(threads.projection(ids.threadId)).rejects.toBeInstanceOf(T3DecodeError);
    await expect(threads.detail(ids.threadId)).rejects.toBeInstanceOf(T3DecodeError);
  }
});
it("reports malformed approval events and recovers with typed fullAccessOverrides and omission", async () => {
  let sequence = 2;
  const chunks = [[snapshotItem(1)]];
  for (const fullAccessOverride of malformed)
    chunks.push([eventItem(sequence++, "turn-item.updated", turnItem({ fullAccessOverride }))]);
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
      event.payload.type !== "approval_request"
    )
      throw new Error("Expected approval turn-item event");
    const option = event.payload;
    const metadata = validMetadata[i]!;
    expectTypeOf(option.fullAccessOverride).toEqualTypeOf<
      KnownOr<"ask_rule" | "provider_check"> | undefined
    >();
    expect(option).toEqual(turnItem(metadata));
    expect(Object.hasOwn(option!, "fullAccessOverride")).toBe(
      Object.hasOwn(metadata, "fullAccessOverride"),
    );
  }
});
