// ---
// relationships:
//   implements: command-line
// ---
import {
  schemas,
  type ScheduledTask,
  type ScheduledTaskWebhookDelivery,
  type ScheduledTaskWebhookDeliverySummary,
  type ScheduledTaskWebhookEndpointInfo,
} from "@wyrd-company/t3code-lib";

const UNITS = [
  ["h", 3_600_000],
  ["m", 60_000],
  ["s", 1000],
] as const;

/** The largest whole unit, such as 1h or 90s. */
export function durationText(ms: number): string {
  for (const [unit, size] of UNITS) if (ms % size === 0) return `${ms / size}${unit}`;
  return `${ms}ms`;
}

function trigger(task: ScheduledTask): string {
  const schedule = task.schedule;
  if (schemas.common.isUnknownVariant<"type">(schedule)) return String(schedule.raw["type"]);
  return schedule.type;
}

function triggerDetail(task: ScheduledTask): string {
  const schedule = task.schedule;
  if (schemas.common.isUnknownVariant<"type">(schedule)) return String(schedule.raw["type"]);
  switch (schedule.type) {
    case "interval":
      return `interval\t${durationText(schedule.everyMs)}`;
    case "fixed_time":
      return `fixed_time\t${schedule.timeOfDay}${schedule.weekdays ? `\t${schedule.weekdays.join(",")}` : ""}`;
    case "webhook":
      return `webhook\t${schedule.signature === null ? "unsigned" : "signed"}`;
  }
}

function workspace(task: ScheduledTask): string {
  const strategy = task.workspaceStrategy;
  switch (strategy.type) {
    case "root":
      return "root";
    case "existing_worktree":
      return `existing_worktree\t${strategy.worktreePath}`;
    case "worktree":
      return [
        "worktree",
        strategy.baseRef,
        strategy.branch ?? "-",
        strategy.startFromOrigin === undefined
          ? "-"
          : `startFromOrigin=${strategy.startFromOrigin}`,
      ].join("\t");
  }
}

export function taskLine(task: ScheduledTask): string {
  return [
    task.id,
    task.enabled ? "enabled" : "disabled",
    trigger(task),
    task.nextRunAt ?? "-",
    task.title,
  ].join("\t");
}

/** One task's fields. The webhook URL token is left to `schedule endpoint`. */
export function taskText(task: ScheduledTask): string {
  return [
    `task\t${task.id}\t${task.title}`,
    `state\t${task.enabled ? "enabled" : "disabled"}`,
    `trigger\t${triggerDetail(task)}`,
    `project\t${task.projectId}`,
    `thread\t${task.threadId ?? "new per run"}`,
    `model\t${task.modelSelection.instanceId}\t${task.modelSelection.model}`,
    `options\t${JSON.stringify(task.modelSelection.options ?? [])}`,
    `modes\t${task.runtimeMode}\t${task.interactionMode}`,
    `workspace\t${workspace(task)}`,
    `runs\t${task.runCount}\t${task.lastRunStatus}\t${task.lastRunAt ?? "-"}`,
    `next\t${task.nextRunAt ?? "-"}`,
    `prompt\n${task.prompt}`,
    ...(task.lastRunError === null ? [] : [`error\t${task.lastRunError.replace(/\s+/gu, " ")}`]),
  ].join("\n");
}

export function endpointText(endpoint: ScheduledTaskWebhookEndpointInfo): string {
  return [
    `url\t${endpoint.url}`,
    `path\t${endpoint.path}`,
    `connect\t${endpoint.connectUrl ?? "-"}`,
    `signature\t${endpoint.hasSecret ? "required" : "none"}`,
  ].join("\n");
}

export function deliveryLine(delivery: ScheduledTaskWebhookDeliverySummary): string {
  return [
    delivery.id,
    delivery.receivedAt,
    delivery.outcome,
    delivery.signatureVerified ? "verified" : "unverified",
    delivery.method,
    `${delivery.bodyBytes}B`,
  ].join("\t");
}

/** Summary, query, body and rendered prompt; headers stay in JSON output. */
export function deliveryText(delivery: ScheduledTaskWebhookDelivery): string {
  return [
    deliveryLine(delivery),
    ...(delivery.error === null ? [] : [`error\t${delivery.error.replace(/\s+/gu, " ")}`]),
    ...(delivery.missingFields.length ? [`missing\t${delivery.missingFields.join(",")}`] : []),
    `query\t${delivery.query || "-"}`,
    `body${delivery.bodyTruncated ? "\ttruncated" : ""}`,
    delivery.body,
    ...(delivery.renderedPrompt === null ? [] : ["prompt", delivery.renderedPrompt]),
  ].join("\n");
}
