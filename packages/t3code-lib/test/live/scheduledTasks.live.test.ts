// ---
// relationships:
//   verifies: library-facades
// ---
/**
 * Scheduled tasks against the isolated stock server. Every task stays
 * disabled or answers only unsigned requests, so no agent run starts.
 */
import { WebSocket as WsWebSocket } from "ws";
import { describe, expect, it } from "vite-plus/test";
import {
  T3AuthError,
  T3Client,
  T3InterruptedError,
  T3NotFoundError,
  T3RpcError,
  providerInstanceId,
  scheduledTaskId,
  type ScheduledTaskUpsertInput,
} from "../../src/index.ts";
import type { WebSocketConstructor } from "../../src/internal/websocket.ts";

const baseUrl = process.env["T3_LIVE_URL"];
const token = process.env["T3_LIVE_TOKEN"];
const webSocket = WsWebSocket as unknown as WebSocketConstructor;

const signature = { header: "x-sample-signature", encoding: "hex", prefix: "sha256=" } as const;

async function post(url: string): Promise<number> {
  const response = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json", [signature.header]: "sha256=00" },
    body: "{}",
  });
  await response.body?.cancel();
  return response.status;
}

async function baseInput(client: T3Client) {
  const { projectId } = await client.projects.ensureScratch();
  const provider = (await client.server.providers())[0];
  return {
    prompt: "Reply with SAMPLE only.",
    enabled: false,
    projectId,
    workspaceStrategy: { type: "root" as const },
    modelSelection: {
      instanceId: provider?.instanceId ?? providerInstanceId("codex"),
      model: provider?.models[0]?.slug ?? "sample-model",
    },
    runtimeMode: "approval-required",
    interactionMode: "default",
  } satisfies Omit<ScheduledTaskUpsertInput, "title" | "schedule">;
}

describe.skipIf(!baseUrl || !token)("live scheduled tasks", () => {
  it("creates, updates, watches and deletes disabled interval tasks", async () => {
    const client = T3Client.create({ baseUrl: baseUrl!, accessToken: token!, webSocket });
    try {
      const base = await baseInput(client);
      const created = await client.scheduledTasks.upsert({
        ...base,
        title: "Sample interval",
        schedule: { type: "fixed_time", timeOfDay: "03:15", weekdays: [0] },
        creationSource: "mcp",
      });
      try {
        expect(created).toMatchObject({ enabled: false, runCount: 0, lastRunStatus: "never" });
        expect(created.webhook).toBeUndefined();
        await expect(client.scheduledTasks.get(created.id)).resolves.toMatchObject({
          id: created.id,
        });

        const updated = await client.scheduledTasks.update(created.id, { title: "Renamed" });
        expect(updated).toMatchObject({
          title: "Renamed",
          prompt: base.prompt,
          enabled: false,
          schedule: { type: "fixed_time", timeOfDay: "03:15", weekdays: [0] },
          creationSource: "mcp",
          runtimeMode: "approval-required",
        });

        const controller = new AbortController();
        for await (const item of client.scheduledTasks.watch({ signal: controller.signal })) {
          expect("tasks" in item && item.tasks.some((task) => task.id === created.id)).toBe(true);
          break;
        }

        const aborted = new AbortController();
        aborted.abort();
        await expect(client.scheduledTasks.list(aborted.signal)).rejects.toBeInstanceOf(
          T3InterruptedError,
        );
      } finally {
        await client.scheduledTasks.delete(created.id);
      }
      await expect(client.scheduledTasks.get(created.id)).resolves.toBeUndefined();
      await expect(
        client.scheduledTasks.update(created.id, { title: "Absent" }),
      ).rejects.toBeInstanceOf(T3NotFoundError);
      await expect(
        client.scheduledTasks.setEnabled(scheduledTaskId("scheduled-task:absent"), false),
      ).rejects.toMatchObject({ tag: "ScheduledTaskError" });
    } finally {
      await client.close();
    }
  });

  it("serves webhook endpoints, records rejected deliveries and rotates tokens", async () => {
    const client = T3Client.create({ baseUrl: baseUrl!, accessToken: token!, webSocket });
    try {
      const base = await baseInput(client);
      const task = await client.scheduledTasks.upsert({
        ...base,
        title: "Sample webhook",
        schedule: {
          type: "webhook",
          signature: { ...signature, secret: "sample-signing-secret" },
          filters: [{ path: "body.action", op: "equals", value: "sample" }],
        },
      });
      try {
        const endpoint = await client.scheduledTasks.webhookEndpoint(task.id);
        expect(endpoint).toMatchObject({ taskId: task.id, hasSecret: true });
        expect(endpoint.path.startsWith("/api/hooks/")).toBe(true);
        expect(endpoint.url).toBe(new URL(endpoint.path, baseUrl).href);
        expect(endpoint.connectUrl).toBeNull();

        // Disabled first, then enabled with a bad signature: neither runs the task.
        await post(endpoint.url);
        await client.scheduledTasks.setEnabled(task.id, true);
        try {
          expect(await post(endpoint.url)).toBe(401);
        } finally {
          await client.scheduledTasks.setEnabled(task.id, false);
        }
        const rows = await client.scheduledTasks.listWebhookDeliveries(task.id);
        expect(rows.map((row) => row.outcome).sort()).toEqual(["disabled", "rejected_signature"]);
        const delivery = await client.scheduledTasks.getWebhookDelivery(task.id, rows[0]!.id);
        expect(delivery).toMatchObject({ taskId: task.id, method: "POST", body: "{}" });
        expect(typeof delivery.headers).toBe("object");
        await expect(client.scheduledTasks.runNow(task.id)).rejects.toBeInstanceOf(T3RpcError);

        const kept = await client.scheduledTasks.update(task.id, { title: "Renamed webhook" });
        expect(kept.schedule).toMatchObject({ signature, filters: [{ path: "body.action" }] });
        expect(kept.webhook?.hasSecret).toBe(true);

        const rotated = await client.scheduledTasks.rotateWebhookToken(task.id);
        expect(rotated.webhook?.path).not.toBe(endpoint.path);
        expect(await post(endpoint.url)).toBe(404);

        const cleared = await client.scheduledTasks.update(task.id, {
          schedule: { type: "webhook", signature: null, filters: [] },
        });
        expect(cleared.schedule).toMatchObject({ signature: null });
        expect(cleared.webhook?.hasSecret).toBe(false);
      } finally {
        await client.scheduledTasks.delete(task.id);
      }
    } finally {
      await client.close();
    }
  });

  it("keeps webhook endpoints and delivery records from a read-only caller", async () => {
    const operator = T3Client.create({ baseUrl: baseUrl!, accessToken: token!, webSocket });
    const reader = T3Client.create({ baseUrl: baseUrl!, webSocket });
    let unknownScopes: T3Client | undefined;
    try {
      const task = await operator.scheduledTasks.upsert({
        ...(await baseInput(operator)),
        title: "Sample read-only webhook",
        schedule: { type: "webhook", signature: null },
      });
      try {
        const pairing = await operator.auth.createPairingCredential({
          label: "sample-reader",
          scopes: ["orchestration:read"],
        });
        await reader.auth.exchangePairingToken(pairing.credential);
        const listed = await reader.scheduledTasks.get(task.id);
        expect(listed).toMatchObject({ id: task.id, schedule: { type: "webhook" } });
        expect(listed?.webhook).toBeUndefined();
        await expect(reader.scheduledTasks.webhookEndpoint(task.id)).rejects.toMatchObject({
          code: "insufficient_scope",
          requiredScope: "orchestration:operate",
        });
        await expect(reader.scheduledTasks.setEnabled(task.id, true)).rejects.toBeInstanceOf(
          T3AuthError,
        );

        // Without locally known scopes the server's stripped list still yields a scope error.
        unknownScopes = T3Client.create({
          baseUrl: baseUrl!,
          accessToken: (await reader.auth.currentAccessToken())!,
          webSocket,
        });
        await expect(unknownScopes.scheduledTasks.webhookEndpoint(task.id)).rejects.toMatchObject({
          code: "insufficient_scope",
        });
        for (const [method, payload] of [
          ["scheduledTasks.listWebhookDeliveries", { id: task.id, acceptAnyOutcome: true }],
          ["scheduledTasks.rotateWebhookToken", { id: task.id }],
        ] as const) {
          const failure = await reader.rpc.callRaw(method, payload).catch((e: unknown) => e);
          expect(failure).toMatchObject({ tag: "EnvironmentAuthorizationError" });
        }
        expect((await operator.scheduledTasks.get(task.id))?.webhook?.path).toBe(
          task.webhook?.path,
        );
      } finally {
        await operator.scheduledTasks.delete(task.id);
      }
    } finally {
      await unknownScopes?.close();
      await reader.close();
      await operator.close();
    }
  });
});
