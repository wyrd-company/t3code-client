// ---
// relationships:
//   implements: command-line
// ---
import {
  schemas,
  T3NotFoundError,
  T3PreconditionError,
  type ScheduledTaskId,
  type ScheduledTaskWebhookDeliveryId,
} from "@wyrd-company/t3code-lib";
import type { InvocationHandler } from "../main.ts";
import { readScheduleDraft, type ReadSource } from "./scheduleInput.ts";
import {
  checkCreateDraft,
  checkUpdateDraft,
  resolveCreate,
  resolveUpdate,
} from "./scheduleResolve.ts";
import { deliveryLine, deliveryText, endpointText, taskLine, taskText } from "./scheduleText.ts";

function taskId(value: string | undefined): ScheduledTaskId {
  const parsed = schemas.common.ScheduledTaskId.safeParse(value);
  if (!parsed.success) throw new T3PreconditionError("A nonempty scheduled task id is required.");
  return parsed.data;
}

function deliveryId(value: string | undefined): ScheduledTaskWebhookDeliveryId {
  const parsed = schemas.scheduledTask.ScheduledTaskWebhookDeliveryId.safeParse(value);
  if (!parsed.success) throw new T3PreconditionError("A nonempty delivery id is required.");
  return parsed.data;
}

function missingTask(id: ScheduledTaskId): T3NotFoundError {
  return new T3NotFoundError(`Scheduled task ${id} does not exist.`, {
    status: 404,
    method: "LOCAL",
    path: "scheduledTasks.get",
    body: undefined,
    reason: "scheduled_task_not_found",
  });
}

const scheduleList: InvocationHandler = async (_, _command, invocation) => {
  const data = await (await invocation.client()).scheduledTasks.list();
  invocation.output.finish({ data, exitCode: 0 }, data.map(taskLine).join("\n"));
};

const scheduleShow: InvocationHandler = async ([value], _command, invocation) => {
  const id = taskId(value);
  const data = await (await invocation.client()).scheduledTasks.get(id);
  if (data === undefined) throw missingTask(id);
  invocation.output.finish({ data, exitCode: 0 }, taskText(data));
};

export function scheduleCreate(read?: ReadSource): InvocationHandler {
  return async (_, command, invocation) => {
    const draft = await readScheduleDraft(command.optsWithGlobals(), read);
    checkCreateDraft(draft);
    const client = await invocation.client();
    const input = await resolveCreate(client, draft);
    await client.scheduledTasks.validateTarget(input);
    invocation.errorContext = "dispatch";
    const data = await client.scheduledTasks.upsert(input);
    invocation.output.finish({ data, exitCode: 0 }, taskText(data));
  };
}

export function scheduleUpdate(read?: ReadSource): InvocationHandler {
  return async ([value], command, invocation) => {
    const id = taskId(value);
    const draft = await readScheduleDraft(command.optsWithGlobals(), read);
    checkUpdateDraft(draft);
    const client = await invocation.client();
    const patch = await resolveUpdate(client, id, draft);
    invocation.errorContext = "dispatch";
    const data = await client.scheduledTasks.update(id, patch);
    invocation.output.finish({ data, exitCode: 0 }, taskText(data));
  };
}

function setEnabled(enabled: boolean): InvocationHandler {
  return async ([value], _command, invocation) => {
    const id = taskId(value);
    const client = await invocation.client();
    invocation.errorContext = "dispatch";
    const data = await client.scheduledTasks.setEnabled(id, enabled);
    invocation.output.finish({ data, exitCode: 0 }, taskLine(data));
  };
}

const scheduleDelete: InvocationHandler = async ([value], _command, invocation) => {
  const id = taskId(value);
  const client = await invocation.client();
  invocation.errorContext = "dispatch";
  await client.scheduledTasks.delete(id);
  invocation.output.finish({ data: { taskId: id }, exitCode: 0 }, `Deleted: ${id}`);
};

const scheduleRun: InvocationHandler = async ([value], _command, invocation) => {
  const id = taskId(value);
  const client = await invocation.client();
  invocation.errorContext = "dispatch";
  const data = await client.scheduledTasks.runNow(id);
  invocation.output.finish({ data, exitCode: 0 }, taskLine(data));
};

const scheduleEndpoint: InvocationHandler = async ([value], _command, invocation) => {
  const id = taskId(value);
  const data = await (await invocation.client()).scheduledTasks.webhookEndpoint(id);
  invocation.output.finish({ data, exitCode: 0 }, endpointText(data));
};

const scheduleRotateToken: InvocationHandler = async ([value], _command, invocation) => {
  const id = taskId(value);
  const client = await invocation.client();
  invocation.errorContext = "dispatch";
  const task = await client.scheduledTasks.rotateWebhookToken(id);
  // The rotation already happened; report the new endpoint from a fresh read.
  const endpoint = await client.scheduledTasks.webhookEndpoint(id);
  invocation.output.finish({ data: { task, endpoint }, exitCode: 0 }, endpointText(endpoint));
};

const deliveryList: InvocationHandler = async ([value], _command, invocation) => {
  const id = taskId(value);
  const data = await (await invocation.client()).scheduledTasks.listWebhookDeliveries(id);
  invocation.output.finish({ data, exitCode: 0 }, data.map(deliveryLine).join("\n"));
};

const deliveryShow: InvocationHandler = async ([value, delivery], _command, invocation) => {
  const id = taskId(value);
  const selected = deliveryId(delivery);
  const data = await (await invocation.client()).scheduledTasks.getWebhookDelivery(id, selected);
  invocation.output.finish({ data, exitCode: 0 }, deliveryText(data));
};

export function scheduleHandlers(read?: ReadSource): Record<string, InvocationHandler> {
  return {
    "schedule list": scheduleList,
    "schedule show": scheduleShow,
    "schedule create": scheduleCreate(read),
    "schedule update": scheduleUpdate(read),
    "schedule enable": setEnabled(true),
    "schedule disable": setEnabled(false),
    "schedule delete": scheduleDelete,
    "schedule run": scheduleRun,
    "schedule endpoint": scheduleEndpoint,
    "schedule rotate-token": scheduleRotateToken,
    "schedule delivery list": deliveryList,
    "schedule delivery show": deliveryShow,
  };
}
