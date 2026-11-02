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
import { T3AuthError, T3NotFoundError, T3PreconditionError } from "../errors.ts";
import { RpcClient } from "../rpc/client.ts";
import { rpcMethods } from "../rpc/registry.ts";
import { scheduledTaskId } from "../schemas/common.ts";
import type { ScheduledTaskWebhookDeliveryId } from "../schemas/scheduledTask.ts";
import { RpcConnection } from "../transport/rpcConnection.ts";
import { SocketTransport } from "../transport/socket.ts";
import { ScheduledTasksApi } from "./scheduledTasks.ts";

const WEBHOOK_ID = scheduledTaskId(webhookTask.id);
const INTERVAL_ID = scheduledTaskId(intervalTask.id);
const READ_ONLY = ["orchestration:read"];
const OPERATOR = ["orchestration:read", "orchestration:operate"];

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
    server.handle("scheduledTasks.subscribe", () => {
      listCalls += 1;
      return { kind: "stream", chunks: [[{ tasks }]] };
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
