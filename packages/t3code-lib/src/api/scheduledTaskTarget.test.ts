// ---
// relationships:
//   verifies: library
//   references: automation-capabilities
// ---
import { afterEach, beforeEach, expect, it } from "vite-plus/test";
import { FakeT3Server } from "../../test/support/fakeServer.ts";
import { intervalTask } from "../../test/support/scheduledTaskFixtures.ts";
import { makeAppThread, makeProjection } from "../../test/support/threadFixtures.ts";
import { T3AuthError, T3InterruptedError, T3PreconditionError, T3RpcError } from "../errors.ts";
import { RpcClient } from "../rpc/client.ts";
import { rpcMethods } from "../rpc/registry.ts";
import { projectId, scheduledTaskId, threadId } from "../schemas/common.ts";
import { ScheduledTaskUpsertInput } from "../schemas/scheduledTask.ts";
import { RpcConnection } from "../transport/rpcConnection.ts";
import { SocketTransport } from "../transport/socket.ts";
import { ScheduledTasksApi } from "./scheduledTasks.ts";

let server: FakeT3Server;
let connection: RpcConnection;
let api: ScheduledTasksApi;
let scopes: readonly string[] | undefined;
let stored: Omit<typeof intervalTask, "threadId" | "projectId"> & {
  threadId: string | null;
  projectId: string;
};
let reads: unknown[];
let writes: unknown[];
const target = { projectId: projectId("project-sample"), threadId: threadId("thread-sample") };
const id = scheduledTaskId(intervalTask.id);

beforeEach(async () => {
  server = await FakeT3Server.start();
  connection = new RpcConnection(new SocketTransport({ url: async () => server.wsUrl }));
  scopes = undefined;
  reads = [];
  writes = [];
  stored = { ...intervalTask, threadId: null };
  api = new ScheduledTasksApi(new RpcClient(connection, rpcMethods, { getScopes: () => scopes }), {
    baseUrl: server.httpUrl,
    getScopes: () => scopes,
  });
  server.handle("scheduledTasks.list", () => ({ kind: "value", value: { tasks: [stored] } }));
  server.handle("scheduledTasks.upsert", (payload) => {
    writes.push(payload);
    return { kind: "value", value: { task: { ...stored, ...(payload as object) } } };
  });
  server.handle("orchestration.getThreadProjection", (payload) => {
    reads.push(payload);
    return {
      kind: "value",
      value: makeProjection({
        thread: makeAppThread({ id: target.threadId, projectId: target.projectId }),
      }),
    };
  });
});
afterEach(async () => {
  await connection.close();
  await server.close();
});

it("validates a bound thread through the typed read without saving", async () => {
  await expect(api.validateTarget(target)).resolves.toBeUndefined();
  expect(reads).toEqual([{ threadId: target.threadId }]);
  expect(writes).toEqual([]);
  await expect(
    api.validateTarget({ ...target, projectId: projectId("project-other") }),
  ).rejects.toBeInstanceOf(T3PreconditionError);
  expect(writes).toEqual([]);
});

it("does not read for new-thread targets or add a read requirement to native upsert", async () => {
  scopes = ["orchestration:operate"];
  await api.validateTarget({ projectId: target.projectId });
  await api.validateTarget({ projectId: target.projectId, threadId: null });
  expect(server.connections).toHaveLength(0);
  await api.upsert(ScheduledTaskUpsertInput.parse({ ...intervalTask, threadId: target.threadId }));
  expect(reads).toEqual([]);
  expect(writes).toHaveLength(1);
  await expect(api.validateTarget(target)).rejects.toMatchObject({
    requiredScope: "orchestration:read",
  });
  expect(reads).toEqual([]);
});

it("checks changed threads and project-only changes against the merged target", async () => {
  await expect(api.update(id, { threadId: target.threadId })).resolves.toMatchObject(target);
  expect(reads).toEqual([{ threadId: target.threadId }]);
  stored = { ...stored, threadId: target.threadId };
  writes = [];
  await expect(api.update(id, { projectId: projectId("project-other") })).rejects.toBeInstanceOf(
    T3PreconditionError,
  );
  expect(writes).toEqual([]);
  stored = { ...stored, projectId: "project-other" };
  await expect(api.update(id, { threadId: threadId("thread-other") })).rejects.toBeInstanceOf(
    T3PreconditionError,
  );
  expect(writes).toEqual([]);
  // Changing both fields is checked as one effective pair.
  await expect(
    api.update(id, { projectId: target.projectId, threadId: target.threadId }),
  ).resolves.toMatchObject(target);
  expect(writes).toHaveLength(1);
});

it("keeps omitted targets and checks no thread when a patch clears its binding", async () => {
  stored = { ...stored, threadId: target.threadId };
  await api.update(id, { title: "Sample renamed" });
  await api.update(id, { projectId: target.projectId, threadId: target.threadId });
  await api.update(id, { projectId: projectId("project-other"), threadId: null });
  expect(reads).toEqual([]);
  expect(writes).toMatchObject([
    { projectId: target.projectId, threadId: target.threadId, title: "Sample renamed" },
    target,
    { projectId: "project-other", threadId: null },
  ]);
});

it("propagates denied and missing-thread reads without a save", async () => {
  scopes = ["orchestration:operate"];
  await expect(api.validateTarget(target)).rejects.toBeInstanceOf(T3AuthError);
  scopes = undefined;
  server.handle("orchestration.getThreadProjection", () => ({
    kind: "fail",
    error: {
      _tag: "OrchestrationV2QueryError",
      message: "Sample missing thread",
      reason: "thread_not_found",
    },
  }));
  await expect(api.validateTarget(target)).rejects.toBeInstanceOf(T3RpcError);
  await expect(api.update(id, { threadId: target.threadId })).rejects.toBeInstanceOf(T3RpcError);
  expect(writes).toEqual([]);
});

it("forwards cancellation to the target read and never saves after failure", async () => {
  let readStarted!: () => void;
  const started = new Promise<void>((resolve) => {
    readStarted = resolve;
  });
  server.handle("orchestration.getThreadProjection", () => {
    readStarted();
    return { kind: "hang" };
  });
  const controller = new AbortController();
  const pending = api.update(id, { threadId: target.threadId }, controller.signal);
  await started;
  controller.abort();
  await expect(pending).rejects.toBeInstanceOf(T3InterruptedError);
  expect(writes).toEqual([]);
});
