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
import { OrchestrationV2WorkflowAgent } from "../schemas/orchestration/workflow.ts";
const agent = (metadata: Record<string, unknown>) => ({
  index: 1,
  label: "sample",
  state: "completed",
  future: true,
  ...metadata,
});
const subagent = (metadata: Record<string, unknown>) => ({
  id: "sample-node",
  threadId: ids.threadId,
  runId: null,
  parentNodeId: "sample-parent",
  origin: "provider_native",
  createdBy: "agent",
  driver: "sample-provider",
  providerInstanceId: "sample-provider",
  providerThreadId: null,
  childThreadId: null,
  nativeTaskRef: null,
  prompt: "Sample prompt",
  title: null,
  model: null,
  status: "completed",
  result: null,
  startedAt: null,
  completedAt: null,
  updatedAt: at,
  workflow: { phases: [], agents: [agent(metadata)] },
});
const validMetadata = [{}, { completedAt: 0 }, { completedAt: 1792944192528 }];
const malformed = [-1, 1.5, null, false, "1792944192528", [], {}];
const projectionFor = (metadata: Record<string, unknown>) => ({
  ...makeProjection(),
  subagents: [subagent(metadata)],
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
it("types workflow completion timestamps and preserves zero, omission and unknown metadata", () => {
  for (const metadata of validMetadata) {
    const parsed = OrchestrationV2WorkflowAgent.parse(agent(metadata));
    expectTypeOf(parsed.completedAt).toEqualTypeOf<number | undefined>();
    expect(parsed).toEqual(agent(metadata));
    expect(Object.hasOwn(parsed, "completedAt")).toBe(Object.hasOwn(metadata, "completedAt"));
  }
});
it("rejects malformed completion timestamps with an otherwise valid workflow agent", () => {
  expect(OrchestrationV2WorkflowAgent.safeParse(agent({})).success).toBe(true);
  for (const completedAt of malformed)
    expect(OrchestrationV2WorkflowAgent.safeParse(agent({ completedAt })).success).toBe(false);
});
it("reads workflow completion timestamps through public HTTP and RPC", async () => {
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
      const value = read.subagents[0]?.workflow?.agents[0];
      if (!value) throw new Error("Expected workflow agent");
      expectTypeOf(value.completedAt).toEqualTypeOf<number | undefined>();
      expect(value).toEqual(agent(metadata));
      expect(Object.hasOwn(value, "completedAt")).toBe(Object.hasOwn(metadata, "completedAt"));
    }
  }
});
it("rejects malformed workflow completion timestamps through public HTTP and RPC", async () => {
  for (const completedAt of malformed) {
    const projection = projectionFor({ completedAt });
    server.respond("orchestration.getThreadProjection", projection);
    server.routes.route(`GET /api/orchestration/threads/${ids.threadId}`, () => ({
      status: 200,
      body: { snapshotSequence: 1, projection },
    }));
    await expect(threads.projection(ids.threadId)).rejects.toBeInstanceOf(T3DecodeError);
    await expect(threads.detail(ids.threadId)).rejects.toBeInstanceOf(T3DecodeError);
  }
});
it("reports malformed workflow events and recovers with typed completion timestamps and omission", async () => {
  let sequence = 2;
  const chunks = [[snapshotItem(1)]];
  for (const completedAt of malformed)
    chunks.push([eventItem(sequence++, "subagent.updated", subagent({ completedAt }))]);
  for (const metadata of validMetadata)
    chunks.push([eventItem(sequence++, "subagent.updated", subagent(metadata))]);
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
    if (!event || "unknown" in event || event.type !== "subagent.updated")
      throw new Error("Expected subagent event");
    const value = event.payload.workflow?.agents[0];
    if (!value) throw new Error("Expected workflow agent");
    const metadata = validMetadata[i]!;
    expectTypeOf(value.completedAt).toEqualTypeOf<number | undefined>();
    expect(value).toEqual(agent(metadata));
    expect(Object.hasOwn(value, "completedAt")).toBe(Object.hasOwn(metadata, "completedAt"));
  }
});
