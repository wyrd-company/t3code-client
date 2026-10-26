// ---
// relationships:
//   verifies: library-wire
// ---
import { afterEach, beforeEach, expect, expectTypeOf, it } from "vite-plus/test";
import { FakeT3Server } from "../../test/support/fakeServer.ts";
import {
  ids,
  makeProjection,
  makeShellThread,
  makeShellSnapshot,
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
import { ShellApi } from "./shell.ts";
import { T3DecodeError } from "../errors.ts";
import { OrchestrationV2PendingBackgroundTask } from "../schemas/orchestration/providerState.ts";

const kinds = ["subagent", "command", "monitor", "background_task", "future_kind", undefined];
const parents = [{}, { parentTaskId: "sample-parent" }, { parentTaskId: " future-parent " }];
const validTasks = kinds.flatMap((kind) =>
  parents.map((parent) => ({
    taskId: "sample-task",
    future: true,
    ...(kind === undefined ? {} : { kind }),
    ...parent,
  })),
);
const malformed = ["", "   ", null, false, 0, [], {}];
const expectedTask = (task: Record<string, unknown>) => ({
  ...task,
  kind: ["subagent", "command", "monitor", "background_task"].includes(task["kind"] as string)
    ? task["kind"]
    : "background_task",
  ...("parentTaskId" in task ? { parentTaskId: (task["parentTaskId"] as string).trim() } : {}),
});
const providerThread = (task: Record<string, unknown>) => ({
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
  pendingBackgroundTasks: [task],
  contextUsage: null,
  goal: null,
  nativeMetadata: null,
  createdAt: at,
  updatedAt: at,
});
const projection = (task: Record<string, unknown>) => ({
  ...makeProjection(),
  providerThreads: [providerThread(task)],
});
let server: FakeT3Server;
let threads: ThreadsApi;
let shell: ShellApi;
let connection: RpcConnection;
beforeEach(async () => {
  server = await FakeT3Server.start();
  connection = new RpcConnection(new SocketTransport({ url: async () => server.wsUrl }));
  const rpc = new RpcClient(connection, rpcMethods);
  const http = new HttpTransport({
    baseUrl: server.httpUrl,
    fetch: server.fetch,
    getAccessToken: async () => "sample-token",
  });
  threads = new ThreadsApi(http, rpc, new CommandDispatcher(rpc));
  shell = new ShellApi(http, rpc);
});
afterEach(async () => {
  await connection.close();
  await server.close();
});
it("types parent task IDs for every kind, trims values and preserves omission and unknown metadata", () => {
  for (const task of validTasks) {
    const parsed = OrchestrationV2PendingBackgroundTask.parse(task);
    expectTypeOf(parsed.parentTaskId).toEqualTypeOf<string | undefined>();
    expect(parsed).toEqual(expectedTask(task));
    expect(Object.hasOwn(parsed, "parentTaskId")).toBe(Object.hasOwn(task, "parentTaskId"));
  }
});
it("rejects malformed parent task IDs for every kind with otherwise valid records", () => {
  for (const kind of kinds) {
    const task = { taskId: "sample-task", ...(kind === undefined ? {} : { kind }) };
    expect(OrchestrationV2PendingBackgroundTask.safeParse(task).success).toBe(true);
    for (const parentTaskId of malformed)
      expect(
        OrchestrationV2PendingBackgroundTask.safeParse({ ...task, parentTaskId }).success,
      ).toBe(false);
  }
});
it("reads parent task IDs and omission through public HTTP and RPC projections", async () => {
  for (const task of validTasks) {
    const raw = projection(task);
    server.respond("orchestration.getThreadProjection", raw);
    server.routes.route(`GET /api/orchestration/threads/${ids.threadId}`, () => ({
      status: 200,
      body: { snapshotSequence: 1, projection: raw },
    }));
    for (const read of [
      await threads.projection(ids.threadId),
      (await threads.detail(ids.threadId)).projection,
    ]) {
      const parsed = read.providerThreads[0]?.pendingBackgroundTasks[0];
      expectTypeOf(parsed?.parentTaskId).toEqualTypeOf<string | undefined>();
      expect(parsed).toEqual(expectedTask(task));
      expect(Object.hasOwn(parsed!, "parentTaskId")).toBe(Object.hasOwn(task, "parentTaskId"));
    }
  }
});
it("rejects malformed parent task IDs through public HTTP and RPC projections", async () => {
  for (const parentTaskId of malformed) {
    const raw = projection({ taskId: "sample-task", kind: "command", parentTaskId });
    server.respond("orchestration.getThreadProjection", raw);
    server.routes.route(`GET /api/orchestration/threads/${ids.threadId}`, () => ({
      status: 200,
      body: { snapshotSequence: 1, projection: raw },
    }));
    await expect(threads.projection(ids.threadId)).rejects.toBeInstanceOf(T3DecodeError);
    await expect(threads.detail(ids.threadId)).rejects.toBeInstanceOf(T3DecodeError);
  }
});
it("reports malformed provider-thread events and recovers with typed parent IDs and omission", async () => {
  let sequence = 2;
  const chunks = [[snapshotItem(1)]];
  for (const parentTaskId of malformed)
    chunks.push([
      eventItem(
        sequence++,
        "provider-thread.updated",
        providerThread({ taskId: "sample-task", kind: "command", parentTaskId }),
      ),
    ]);
  for (const task of validTasks)
    chunks.push([eventItem(sequence++, "provider-thread.updated", providerThread(task))]);
  server.handle("orchestration.subscribeThread", () => ({ kind: "stream", chunks }));
  const seen = [];
  for await (const item of threads.watch(ids.threadId)) seen.push(item);
  expect(seen.map((item) => item.kind)).toEqual([
    "snapshot",
    ...malformed.map(() => "decode-error"),
    ...validTasks.map(() => "event"),
  ]);
  const events = seen.filter((item) => item.kind === "event");
  for (let i = 0; i < events.length; i++) {
    const event = events[i]?.event;
    if (!event || "unknown" in event || event.type !== "provider-thread.updated")
      throw new Error("Expected provider thread event");
    const parsed = event.payload.pendingBackgroundTasks[0];
    expectTypeOf(parsed?.parentTaskId).toEqualTypeOf<string | undefined>();
    expect(parsed).toEqual(expectedTask(validTasks[i]!));
  }
});
it("reads and validates parent task IDs in public shell snapshots", async () => {
  const rawShell = (task: Record<string, unknown>) => ({
    ...makeShellSnapshot({}),
    threads: [{ ...makeShellThread(), pendingBackgroundTasks: [task] }],
  });
  for (const task of validTasks) {
    server.routes.route("GET /api/orchestration/shell", () => ({
      status: 200,
      body: rawShell(task),
    }));
    const parsed = (await shell.snapshot()).threads[0]?.pendingBackgroundTasks[0];
    expectTypeOf(parsed?.parentTaskId).toEqualTypeOf<string | undefined>();
    expect(parsed).toEqual(expectedTask(task));
    expect(Object.hasOwn(parsed!, "parentTaskId")).toBe(Object.hasOwn(task, "parentTaskId"));
  }
  for (const parentTaskId of malformed) {
    server.routes.route("GET /api/orchestration/shell", () => ({
      status: 200,
      body: rawShell({ taskId: "sample-task", kind: "command", parentTaskId }),
    }));
    await expect(shell.snapshot()).rejects.toBeInstanceOf(T3DecodeError);
  }
});
