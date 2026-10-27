// ---
// relationships:
//   verifies: library
// ---
import { afterEach, beforeEach, describe, expect, it } from "vite-plus/test";

import { FakeT3Server } from "../../test/support/fakeServer.ts";
import {
  deliverySummary,
  intervalTask,
  webhookEndpoint,
  webhookTask,
} from "../../test/support/scheduledTaskFixtures.ts";
import {
  T3AuthError,
  T3InterruptedError,
  T3NotFoundError,
  T3PreconditionError,
  T3RpcError,
} from "../errors.ts";
import { RpcClient } from "../rpc/client.ts";
import { rpcMethods } from "../rpc/registry.ts";
import { scheduledTaskId } from "../schemas/common.ts";
import type { ScheduledTaskWebhookDeliveryId } from "../schemas/scheduledTask.ts";
import { RpcConnection } from "../transport/rpcConnection.ts";
import { SocketTransport } from "../transport/socket.ts";
import { ScheduledTasksApi } from "./scheduledTasks.ts";

const until = async (check: () => boolean): Promise<void> => {
  const deadline = Date.now() + 3_000;
  while (!check()) {
    if (Date.now() > deadline) throw new Error("condition not met");
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
};

const WEBHOOK_ID = scheduledTaskId(webhookTask.id);
const INTERVAL_ID = scheduledTaskId(intervalTask.id);
const READ_ONLY = ["orchestration:read"];
const OPERATOR = ["orchestration:read", "orchestration:operate"];

describe("ScheduledTasksApi", () => {
  let server: FakeT3Server;
  let connection: RpcConnection;
  let scopes: readonly string[] | undefined;
  let api: ScheduledTasksApi;
  let received: { method: string; payload: unknown }[];

  const record = (method: string, value: unknown) =>
    server.handle(method, (payload) => {
      received.push({ method, payload });
      return { kind: "value", value };
    });
  const sent = (method: string) =>
    received.filter((entry) => entry.method === method).map((entry) => entry.payload);

  beforeEach(async () => {
    server = await FakeT3Server.start();
    connection = new RpcConnection(new SocketTransport({ url: async () => server.wsUrl }));
    scopes = undefined;
    received = [];
    api = new ScheduledTasksApi(
      new RpcClient(connection, rpcMethods, { getScopes: () => scopes }),
      { baseUrl: "http://127.0.0.1:4000/", getScopes: () => scopes },
    );
    record("scheduledTasks.list", { tasks: [intervalTask, webhookTask] });
    server.handle("scheduledTasks.upsert", (payload) => {
      received.push({ method: "scheduledTasks.upsert", payload });
      return { kind: "value", value: { task: { ...webhookTask, ...(payload as object) } } };
    });
  });

  afterEach(async () => {
    await connection.close();
    await server.close();
  });

  it("lists tasks, finds one by id and returns undefined for an absent id", async () => {
    await expect(api.list()).resolves.toHaveLength(2);
    await expect(api.get(INTERVAL_ID)).resolves.toMatchObject({ id: intervalTask.id });
    await expect(api.get(scheduledTaskId("scheduled-task:absent"))).resolves.toBeUndefined();
    expect(sent("scheduledTasks.list")).toEqual([{}, {}, {}]);
  });

  it("unwraps mutation results and sends the exact payloads", async () => {
    record("scheduledTasks.setEnabled", { task: { ...intervalTask, enabled: false } });
    record("scheduledTasks.runNow", { task: { ...intervalTask, lastRunStatus: "running" } });
    record("scheduledTasks.rotateWebhookToken", { task: webhookTask });
    record("scheduledTasks.delete", { id: intervalTask.id });

    await expect(api.setEnabled(INTERVAL_ID, false)).resolves.toMatchObject({ enabled: false });
    await expect(api.runNow(INTERVAL_ID)).resolves.toMatchObject({ lastRunStatus: "running" });
    await expect(api.rotateWebhookToken(WEBHOOK_ID)).resolves.toMatchObject({
      webhook: webhookEndpoint,
    });
    await expect(api.delete(INTERVAL_ID)).resolves.toBeUndefined();
    expect(received.filter((entry) => entry.method !== "scheduledTasks.list")).toEqual([
      { method: "scheduledTasks.setEnabled", payload: { id: intervalTask.id, enabled: false } },
      { method: "scheduledTasks.runNow", payload: { id: intervalTask.id } },
      { method: "scheduledTasks.rotateWebhookToken", payload: { id: webhookTask.id } },
      { method: "scheduledTasks.delete", payload: { id: intervalTask.id } },
    ]);
  });

  it("passes upsert input through unchanged", async () => {
    const { id: _id, ...input } = intervalTask;
    const upsert = {
      title: input.title,
      prompt: input.prompt,
      enabled: false,
      schedule: { type: "fixed_time" as const, timeOfDay: "09:30", weekdays: [1, 5] },
      projectId: intervalTask.projectId as never,
      workspaceStrategy: { type: "root" as const },
      modelSelection: { instanceId: "sample-provider" as never, model: "sample-model" },
      runtimeMode: "full-access",
      interactionMode: "default",
    };
    await api.upsert(upsert);
    expect(sent("scheduledTasks.upsert")).toEqual([upsert]);
  });

  it("rejects a sub-minute interval and an invalid dedupe template before sending", async () => {
    const base = {
      title: "Sample",
      prompt: "Sample",
      enabled: false,
      projectId: "project-sample" as never,
      workspaceStrategy: { type: "root" as const },
      modelSelection: { instanceId: "sample-provider" as never, model: "sample-model" },
      runtimeMode: "full-access",
      interactionMode: "default",
    };
    await expect(
      api.upsert({ ...base, schedule: { type: "interval", everyMs: 1_000 } }),
    ).rejects.toBeInstanceOf(T3PreconditionError);
    await expect(
      api.upsert({
        ...base,
        schedule: { type: "webhook", signature: null, dedupe: { replayKey: "{{unknown}}" } },
      }),
    ).rejects.toBeInstanceOf(T3PreconditionError);
    expect(server.connections).toHaveLength(0);
  });

  it("updates by keeping omitted properties and requiring the task to exist", async () => {
    await api.update(INTERVAL_ID, { title: "Renamed task" });
    expect(sent("scheduledTasks.upsert")).toEqual([
      {
        id: intervalTask.id,
        requireExisting: true,
        title: "Renamed task",
        prompt: intervalTask.prompt,
        enabled: true,
        schedule: { type: "interval", everyMs: 3_600_000 },
        projectId: intervalTask.projectId,
        threadId: null,
        workspaceStrategy: { type: "root" },
        modelSelection: { instanceId: "sample-provider", model: "sample-model" },
        runtimeMode: "full-access",
        interactionMode: "default",
        createdBy: "agent",
        creationSource: "mcp",
      },
    ]);
  });

  it("keeps a stored signature, age bound, dedupe and filters when the update omits them", async () => {
    await api.update(WEBHOOK_ID, { prompt: "New prompt" });
    await api.update(WEBHOOK_ID, { schedule: { type: "webhook" } });
    const schedules = sent("scheduledTasks.upsert").map(
      (payload) => (payload as { schedule: unknown }).schedule,
    );
    const kept = {
      type: "webhook",
      signature: { header: "x-sample-signature", encoding: "hex", prefix: "sha256=" },
      maxDeliveryAgeMinutes: 30,
    };
    // No secret is sent, so the server keeps the stored one; omitted dedupe and filters are kept too.
    expect(schedules).toEqual([kept, kept]);
  });

  it("sends null signature and empty filters as the server's clearing values", async () => {
    await api.update(WEBHOOK_ID, {
      schedule: { type: "webhook", signature: null, maxDeliveryAgeMinutes: null, filters: [] },
    });
    expect(sent("scheduledTasks.upsert")).toMatchObject([
      {
        schedule: { type: "webhook", signature: null, maxDeliveryAgeMinutes: null, filters: [] },
      },
    ]);
  });

  it("sends a new signing secret only when the update supplies one", async () => {
    const signature = {
      header: "x-sample-signature",
      encoding: "base64" as const,
      prefix: "",
      secret: "sample-secret",
    };
    await api.update(WEBHOOK_ID, { schedule: { type: "webhook", signature } });
    expect(sent("scheduledTasks.upsert")).toMatchObject([{ schedule: { signature } }]);
  });

  it("clears the thread only for an explicit null", async () => {
    const stored = { ...intervalTask, threadId: "thread-sample" };
    record("scheduledTasks.list", { tasks: [stored] });
    await api.update(INTERVAL_ID, {});
    await api.update(INTERVAL_ID, { threadId: null });
    expect(sent("scheduledTasks.upsert").map((p) => (p as { threadId: unknown }).threadId)).toEqual(
      ["thread-sample", null],
    );
  });

  it("refuses to resend an unknown trigger type unless the update supplies a schedule", async () => {
    const future = { ...intervalTask, schedule: { type: "calendar_event", calendar: "sample" } };
    record("scheduledTasks.list", { tasks: [future] });
    await expect(api.get(INTERVAL_ID)).resolves.toMatchObject({
      schedule: { unknown: true, raw: { type: "calendar_event" } },
    });
    await expect(api.update(INTERVAL_ID, { title: "Sample" })).rejects.toBeInstanceOf(
      T3PreconditionError,
    );
    await api.update(INTERVAL_ID, { schedule: { type: "interval", everyMs: 60_000 } });
    expect(sent("scheduledTasks.upsert")).toHaveLength(1);
  });

  it("fails an update of a missing task as not found without saving", async () => {
    const failure = api.update(scheduledTaskId("scheduled-task:absent"), { enabled: false });
    await expect(failure).rejects.toBeInstanceOf(T3NotFoundError);
    await expect(failure).rejects.toMatchObject({ reason: "scheduled_task_not_found" });
    expect(sent("scheduledTasks.upsert")).toEqual([]);
  });

  it("checks orchestration:operate locally for mutations when scopes are known", async () => {
    scopes = READ_ONLY;
    await expect(api.setEnabled(INTERVAL_ID, true)).rejects.toMatchObject({
      code: "insufficient_scope",
      requiredScope: "orchestration:operate",
    });
    await expect(api.update(INTERVAL_ID, {})).rejects.toBeInstanceOf(T3AuthError);
    await expect(api.listWebhookDeliveries(WEBHOOK_ID)).rejects.toBeInstanceOf(T3AuthError);
    await expect(api.list()).resolves.toHaveLength(2);
    expect(received.map((entry) => entry.method)).toEqual(["scheduledTasks.list"]);
  });

  it("surfaces a ScheduledTaskError as a typed RPC failure", async () => {
    server.handle("scheduledTasks.runNow", () => ({
      kind: "fail",
      error: {
        _tag: "ScheduledTaskError",
        message: "Webhook tasks run when their URL receives a request.",
        taskId: webhookTask.id,
      },
    }));
    const failure = await api.runNow(WEBHOOK_ID).catch((error: unknown) => error);
    expect(failure).toBeInstanceOf(T3RpcError);
    const rpcError = failure as T3RpcError;
    expect(rpcError.is("ScheduledTaskError") && rpcError.record.taskId).toBe(webhookTask.id);
  });

  it("forwards the abort signal", async () => {
    server.handle("scheduledTasks.runNow", (payload) => {
      received.push({ method: "scheduledTasks.runNow", payload });
      return { kind: "hang" };
    });
    const controller = new AbortController();
    const pending = api.runNow(INTERVAL_ID, controller.signal);
    await until(() => sent("scheduledTasks.runNow").length === 1);
    controller.abort();
    await expect(pending).rejects.toBeInstanceOf(T3InterruptedError);
  });

  it("watches the task list as decoded stream items", async () => {
    server.handle("scheduledTasks.subscribe", () => ({
      kind: "stream",
      chunks: [[{ tasks: [intervalTask] }], [{ tasks: "malformed" }]],
    }));
    const items = [];
    for await (const item of api.watch()) items.push(item);
    expect(items[0]).toMatchObject({ tasks: [{ id: intervalTask.id }] });
    expect(items[1]).toMatchObject({ kind: "decode-error" });
  });
});

describe("ScheduledTasksApi webhook deliveries and endpoints", () => {
  let server: FakeT3Server;
  let connection: RpcConnection;
  let scopes: readonly string[] | undefined;
  let api: ScheduledTasksApi;
  let tasks: unknown[];
  let listCalls: number;

  beforeEach(async () => {
    server = await FakeT3Server.start();
    connection = new RpcConnection(new SocketTransport({ url: async () => server.wsUrl }));
    scopes = undefined;
    tasks = [intervalTask, webhookTask];
    listCalls = 0;
    server.handle("scheduledTasks.list", () => {
      listCalls += 1;
      return { kind: "value", value: { tasks } };
    });
    api = new ScheduledTasksApi(
      new RpcClient(connection, rpcMethods, { getScopes: () => scopes }),
      { baseUrl: "https://t3.example.test/", getScopes: () => scopes },
    );
  });

  afterEach(async () => {
    await connection.close();
    await server.close();
  });

  it("asks for every outcome and keeps outcomes newer than the client", async () => {
    const payloads: unknown[] = [];
    server.handle("scheduledTasks.listWebhookDeliveries", (payload) => {
      payloads.push(payload);
      return {
        kind: "value",
        value: { deliveries: [deliverySummary, { ...deliverySummary, outcome: "quarantined" }] },
      };
    });
    server.handle("scheduledTasks.getWebhookDelivery", (payload) => {
      payloads.push(payload);
      const delivery = {
        ...deliverySummary,
        outcome: "disabled",
        query: "",
        headers: { "content-type": "application/json" },
        body: "{}",
        bodyTruncated: false,
        renderedPrompt: null,
      };
      return { kind: "value", value: { delivery } };
    });

    const rows = await api.listWebhookDeliveries(WEBHOOK_ID);
    expect(rows.map((row) => row.outcome)).toEqual(["rejected_signature", "quarantined"]);
    const deliveryId = "delivery-sample" as ScheduledTaskWebhookDeliveryId;
    await expect(api.getWebhookDelivery(WEBHOOK_ID, deliveryId)).resolves.toMatchObject({
      outcome: "disabled",
      headers: { "content-type": "application/json" },
    });
    expect(payloads).toEqual([
      { id: webhookTask.id, acceptAnyOutcome: true },
      { id: webhookTask.id, deliveryId: "delivery-sample", acceptAnyOutcome: true },
    ]);
  });

  it("resolves the endpoint path against the client's server URL", async () => {
    scopes = OPERATOR;
    await expect(api.webhookEndpoint(WEBHOOK_ID)).resolves.toEqual({
      taskId: webhookTask.id,
      path: webhookEndpoint.path,
      url: `https://t3.example.test${webhookEndpoint.path}`,
      connectUrl: null,
      hasSecret: true,
    });
  });

  it("returns the T3 Connect URL when the server supplies one", async () => {
    const connectUrl = "https://relay.example.test/hooks/sample/sample-token";
    tasks = [
      { ...webhookTask, webhook: { ...webhookEndpoint, url: connectUrl, hasSecret: false } },
    ];
    await expect(api.webhookEndpoint(WEBHOOK_ID)).resolves.toMatchObject({
      connectUrl,
      hasSecret: false,
    });
  });

  it("fails as not found for a missing task and as a precondition for another trigger", async () => {
    await expect(
      api.webhookEndpoint(scheduledTaskId("scheduled-task:absent")),
    ).rejects.toBeInstanceOf(T3NotFoundError);
    await expect(api.webhookEndpoint(INTERVAL_ID)).rejects.toBeInstanceOf(T3PreconditionError);
  });

  it("reports insufficient scope for a read-only caller instead of inventing an endpoint", async () => {
    // A reader's list has no endpoint: the server removed it.
    const { webhook: _webhook, ...stripped } = webhookTask;
    tasks = [stripped];
    const failure = api.webhookEndpoint(WEBHOOK_ID);
    await expect(failure).rejects.toBeInstanceOf(T3AuthError);
    await expect(failure).rejects.toMatchObject({
      code: "insufficient_scope",
      requiredScope: "orchestration:operate",
    });

    // Known read-only scopes fail before any request.
    scopes = READ_ONLY;
    await expect(api.webhookEndpoint(WEBHOOK_ID)).rejects.toMatchObject({
      code: "insufficient_scope",
    });
    expect(listCalls).toBe(1);
  });
});
