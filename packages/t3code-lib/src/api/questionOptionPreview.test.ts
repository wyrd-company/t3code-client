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
import { OrchestrationV2UserInputQuestion } from "../schemas/orchestration/messages.ts";
const question = (metadata: Record<string, unknown>) => ({
  id: "question-1",
  header: "Color",
  question: "Choose a sample color.",
  options: [{ label: "Blue", description: "Use blue.", future: true, ...metadata }],
});
const turnItem = (metadata: Record<string, unknown>) =>
  items.userInputRequest("request-1", { questions: [question(metadata)] });
const validMetadata = [
  {},
  { preview: "" },
  { preview: "sample" },
  { preview: "line one\nline two" },
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
it("types question option previews and preserves strings, omission and unknown metadata", () => {
  for (const metadata of validMetadata) {
    const parsed = OrchestrationV2UserInputQuestion.parse(question(metadata));
    expectTypeOf(parsed.options[0]?.preview).toEqualTypeOf<string | undefined>();
    expect(parsed.options[0]).toEqual(question(metadata).options[0]);
    expect(Object.hasOwn(parsed.options[0]!, "preview")).toBe(Object.hasOwn(metadata, "preview"));
  }
});
it("rejects nonstring previews with otherwise valid question options", () => {
  expect(OrchestrationV2UserInputQuestion.safeParse(question({})).success).toBe(true);
  for (const preview of malformed)
    expect(OrchestrationV2UserInputQuestion.safeParse(question({ preview })).success).toBe(false);
});
it("reads option preview strings and omission through public HTTP and RPC", async () => {
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
      if (!item || item.type !== "user_input_request")
        throw new Error("Expected question turn item");
      const option = item.questions[0]?.options[0];
      expectTypeOf(option?.preview).toEqualTypeOf<string | undefined>();
      expect(option).toEqual(question(metadata).options[0]);
      expect(Object.hasOwn(option!, "preview")).toBe(Object.hasOwn(metadata, "preview"));
    }
  }
});
it("rejects malformed option previews through public HTTP and RPC", async () => {
  for (const preview of malformed) {
    const projection = { ...makeProjection(), turnItems: [turnItem({ preview })] };
    server.respond("orchestration.getThreadProjection", projection);
    server.routes.route(`GET /api/orchestration/threads/${ids.threadId}`, () => ({
      status: 200,
      body: { snapshotSequence: 1, projection },
    }));
    await expect(threads.projection(ids.threadId)).rejects.toBeInstanceOf(T3DecodeError);
    await expect(threads.detail(ids.threadId)).rejects.toBeInstanceOf(T3DecodeError);
  }
});
it("reports malformed question events and recovers with typed previews and omission", async () => {
  let sequence = 2;
  const chunks = [[snapshotItem(1)]];
  for (const preview of malformed)
    chunks.push([eventItem(sequence++, "turn-item.updated", turnItem({ preview }))]);
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
      event.payload.type !== "user_input_request"
    )
      throw new Error("Expected question turn-item event");
    const option = event.payload.questions[0]?.options[0];
    const metadata = validMetadata[i]!;
    expectTypeOf(option?.preview).toEqualTypeOf<string | undefined>();
    expect(option).toEqual(question(metadata).options[0]);
    expect(Object.hasOwn(option!, "preview")).toBe(Object.hasOwn(metadata, "preview"));
  }
});
