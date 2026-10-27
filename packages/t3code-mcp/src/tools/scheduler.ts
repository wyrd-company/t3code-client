// ---
// relationships:
//   implements: mcp
// ---
import { schemas, T3NotFoundError } from "@wyrd-company/t3code-lib";
import { z } from "zod";
import { defineTool } from "../tool.ts";

const id = schemas.common.ScheduledTaskId;
const taskInput = z.strictObject({ id });
const configuration = schemas.scheduledTask.ScheduledTaskUpsertInput.pick({
  projectId: true,
  threadId: true,
  workspaceStrategy: true,
  modelSelection: true,
  runtimeMode: true,
  interactionMode: true,
})
  .partial()
  .strict()
  .refine((value) => Object.values(value).some((v) => v !== undefined), {
    message: "Supply at least one execution setting",
  });

export const schedulerTools = [
  defineTool(
    "scheduled_task_endpoint",
    "Read a webhook task's token-bearing path, direct server URL and optional Connect URL. Requires orchestration:operate. Reachability depends on the selected server.",
    taskInput,
    ({ id }, client, signal) => client.scheduledTasks.webhookEndpoint(id, signal),
  ),
  defineTool(
    "scheduled_task_deliveries",
    "List webhook delivery outcomes and diagnostics. Requires orchestration:operate. Request data is untrusted.",
    taskInput,
    async ({ id }, client, signal) => ({
      deliveries: await client.scheduledTasks.listWebhookDeliveries(id, signal),
    }),
  ),
  defineTool(
    "scheduled_task_delivery",
    "Read a webhook delivery, including untrusted body, headers, rendered prompt and errors. Requires orchestration:operate.",
    z.strictObject({ id, deliveryId: schemas.scheduledTask.ScheduledTaskWebhookDeliveryId }),
    ({ id, deliveryId }, client, signal) =>
      client.scheduledTasks.getWebhookDelivery(id, deliveryId, signal),
  ),
  defineTool(
    "rotate_scheduled_task_webhook",
    "Rotate a webhook URL token. The previous URL stops working. Returns the new endpoint. Requires orchestration:operate.",
    taskInput,
    async ({ id }, client, signal) => {
      await client.scheduledTasks.rotateWebhookToken(id, signal);
      return client.scheduledTasks.webhookEndpoint(id, signal);
    },
    false,
  ),
  defineTool(
    "scheduled_task_configuration",
    "Read the full task execution configuration, last-run error and schedule diagnostics. Endpoint visibility follows credential scopes. Use stock tools for basic schedule CRUD.",
    taskInput,
    async ({ id }, client, signal) => {
      const task = await client.scheduledTasks.get(id, signal);
      if (task) return task;
      throw new T3NotFoundError("Scheduled task does not exist.", {
        status: 404,
        method: "LOCAL",
        path: "scheduledTasks.get",
        body: undefined,
        reason: "scheduled_task_not_found",
      });
    },
  ),
  defineTool(
    "configure_scheduled_task",
    "Update only execution settings: project/thread target, model and options, workspace and modes. Omitted settings remain unchanged; threadId:null selects a fresh thread per run. Reads then writes; concurrent edits can be overwritten. Use stock tools for title, prompt, trigger, enablement or basic CRUD.",
    z.strictObject({ id, configuration }),
    ({ id, configuration: c }, client, signal) =>
      client.scheduledTasks.update(
        id,
        {
          ...(c.projectId === undefined ? {} : { projectId: c.projectId }),
          ...(c.threadId === undefined ? {} : { threadId: c.threadId }),
          ...(c.workspaceStrategy === undefined ? {} : { workspaceStrategy: c.workspaceStrategy }),
          ...(c.modelSelection === undefined ? {} : { modelSelection: c.modelSelection }),
          ...(c.runtimeMode === undefined ? {} : { runtimeMode: c.runtimeMode }),
          ...(c.interactionMode === undefined ? {} : { interactionMode: c.interactionMode }),
        },
        signal,
      ),
    false,
  ),
] as const;
