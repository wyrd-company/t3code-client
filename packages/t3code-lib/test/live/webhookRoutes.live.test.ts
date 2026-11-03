// ---
// relationships:
//   verifies: library-transport
// ---
/**
 * A webhook task's endpoint on a real server. A filter holds every request of the first tests, so
 * no agent run starts. With `T3_LIVE_AGENT=1`, a `gpt-6-luna` subject runs an accepted request.
 */
import * as NodeCrypto from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vite-plus/test";
import {
  T3AuthError,
  T3HttpError,
  T3NotFoundError,
  type ScheduledTaskUpsertInput,
  webhookUrlParams,
} from "../../src/index.ts";
import { ScheduledTaskWebhookDeliveryId } from "../../src/schemas/scheduledTask.ts";
import { hasAgent, hasLiveServer, modelSelection, waitFor } from "./liveClient.ts";
import { type PeerServer, startPeerServer } from "./peerServer.ts";

const SECRET = "sample-signing-secret";
const HEADER = "x-sample-signature";
const signed = (body: Uint8Array) => ({
  "content-type": "application/json",
  [HEADER]: `sha256=${NodeCrypto.createHmac("sha256", SECRET).update(body).digest("hex")}`,
});
const json = (value: unknown) => new TextEncoder().encode(JSON.stringify(value));

const baseInput = (projectId: ScheduledTaskUpsertInput["projectId"]) =>
  ({
    prompt: "Reply with SAMPLE only.",
    enabled: true,
    projectId,
    workspaceStrategy: { type: "root" as const },
    modelSelection,
    runtimeMode: "auto",
    interactionMode: "default",
  }) satisfies Omit<ScheduledTaskUpsertInput, "title" | "schedule">;

describe.skipIf(!hasLiveServer)("live webhook routes", () => {
  let server: PeerServer;
  let base: ReturnType<typeof baseInput>;

  beforeAll(async () => {
    server = await startPeerServer();
    const { projectId } = await server.client.projects.ensureScratch();
    base = baseInput(projectId);
  }, 90_000);
  afterAll(async () => {
    await server?.stop();
  });

  const unsignedTask = async () => {
    const task = await server.client.scheduledTasks.upsert({
      ...base,
      title: "Sample unsigned webhook",
      schedule: {
        type: "webhook",
        signature: null,
        filters: [{ path: "headers.x-sample-event", op: "equals", value: "never-sent" }],
      },
    });
    return { task, params: webhookUrlParams(task.webhook?.path ?? "") };
  };

  it("answers each method with a delivery id, and records what it read", async () => {
    const { routes, scheduledTasks } = server.client;
    const { task, params } = await unsignedTask();
    const answers = await Promise.all([
      routes.call("webhooks.webhookPost", { params, body: json({ action: "sample" }) }),
      routes.call("webhooks.webhookPut", { params, body: json({ action: "sample" }) }),
      routes.call("webhooks.webhookPatch", { params, body: json({ action: "sample" }) }),
      routes.call("webhooks.webhookGet", { params, query: { sample: "value" } }),
    ]);
    expect(new Set(answers.map(({ deliveryId }) => deliveryId)).size).toBe(4);
    const rows = await scheduledTasks.listWebhookDeliveries(task.id);
    expect(rows.map(({ outcome }) => outcome)).toEqual(Array(4).fill("filtered"));
    expect(rows.map(({ method }) => method).toSorted()).toEqual(["GET", "PATCH", "POST", "PUT"]);
    await scheduledTasks.delete(task.id);
  });

  it("checks a signature over the raw bytes, with the caller's headers", async () => {
    const { routes, scheduledTasks } = server.client;
    const task = await scheduledTasks.upsert({
      ...base,
      title: "Sample signed webhook",
      schedule: {
        type: "webhook",
        signature: { header: HEADER, encoding: "hex", prefix: "sha256=", secret: SECRET },
        filters: [{ path: "body.action", op: "equals", value: "never-sent" }],
      },
    });
    const params = webhookUrlParams(task.webhook?.path ?? "");
    const body = json({ action: "sample" });
    const accepted = await routes.call("webhooks.webhookPost", {
      params,
      headers: signed(body),
      body,
    });
    expect(accepted.deliveryId).not.toBe("");
    const refused = await routes
      .call("webhooks.webhookPost", {
        params,
        headers: signed(json({ action: "other" })),
        body,
      })
      .catch((error: unknown) => error);
    expect(refused).toBeInstanceOf(T3AuthError);
    expect(refused).toMatchObject({
      status: 401,
      reason: "invalid_signature",
      path: "/api/hooks/:hookId/:token",
    });
    expect(String((refused as Error).message)).not.toContain(params.token);
    await scheduledTasks.delete(task.id);
  });

  it("refuses an unknown hook, and a disabled one", async () => {
    const { routes, scheduledTasks } = server.client;
    const { task, params } = await unsignedTask();
    const unknown = await routes
      .call("webhooks.webhookPost", { params: { ...params, token: "sample-other-token" } })
      .catch((error: unknown) => error);
    expect(unknown).toBeInstanceOf(T3NotFoundError);
    expect(unknown).toMatchObject({ status: 404, reason: "hook_not_found" });
    await scheduledTasks.setEnabled(task.id, false);
    const disabled = await routes
      .call("webhooks.webhookGet", { params })
      .catch((error: unknown) => error);
    expect(disabled).toBeInstanceOf(T3HttpError);
    expect(disabled).toMatchObject({ status: 409, reason: "hook_disabled" });
    await scheduledTasks.delete(task.id);
  });

  it.skipIf(!hasAgent)(
    "starts a run for a request that the filter passes",
    async () => {
      const { routes, scheduledTasks } = server.client;
      const task = await scheduledTasks.upsert({
        ...base,
        title: "Sample accepted webhook",
        prompt: "Reply with SAMPLE only. Event: {{body.action}}",
        schedule: {
          type: "webhook",
          signature: null,
          filters: [{ path: "body.action", op: "equals", value: "sample" }],
        },
      });
      const params = webhookUrlParams(task.webhook?.path ?? "");
      const { deliveryId } = await routes.call("webhooks.webhookPost", {
        params,
        headers: { "content-type": "application/json" },
        body: json({ action: "sample" }),
      });
      const delivery = await scheduledTasks.getWebhookDelivery(
        task.id,
        ScheduledTaskWebhookDeliveryId.parse(deliveryId),
      );
      expect(delivery).toMatchObject({ outcome: "accepted" });
      await waitFor(
        async () => {
          const read = await scheduledTasks.get(task.id);
          return read?.lastRunStatus !== "never" ? read : undefined;
        },
        "the run of the accepted request",
        { timeoutMs: 120_000 },
      );
      await scheduledTasks.delete(task.id);
    },
    180_000,
  );
});
