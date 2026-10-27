// ---
// relationships:
//   implements: library
// ---
import { z } from "zod";
import { defineMethod } from "../spec.ts";
import {
  ScheduledTaskDeleteResult,
  ScheduledTaskGetWebhookDeliveryInput,
  ScheduledTaskGetWebhookDeliveryResult,
  ScheduledTaskIdInput,
  ScheduledTaskListResult,
  ScheduledTaskListWebhookDeliveriesInput,
  ScheduledTaskListWebhookDeliveriesResult,
  ScheduledTaskMutationResult,
  ScheduledTaskSetEnabledInput,
  ScheduledTaskUpsertInput,
} from "../../schemas/scheduledTask.ts";

// Readers see tasks without webhook endpoints; endpoints, mutations and
// delivery records need orchestration:operate.
export const scheduledTasksMethods = {
  "scheduledTasks.list": defineMethod({
    payload: z.looseObject({}),
    success: ScheduledTaskListResult,
    stream: false,
    scope: "orchestration:read",
  }),
  "scheduledTasks.subscribe": defineMethod({
    payload: z.looseObject({}),
    success: ScheduledTaskListResult,
    stream: true,
    scope: "orchestration:read",
  }),
  "scheduledTasks.upsert": defineMethod({
    payload: ScheduledTaskUpsertInput,
    success: ScheduledTaskMutationResult,
    stream: false,
    scope: "orchestration:operate",
  }),
  "scheduledTasks.setEnabled": defineMethod({
    payload: ScheduledTaskSetEnabledInput,
    success: ScheduledTaskMutationResult,
    stream: false,
    scope: "orchestration:operate",
  }),
  "scheduledTasks.delete": defineMethod({
    payload: ScheduledTaskIdInput,
    success: ScheduledTaskDeleteResult,
    stream: false,
    scope: "orchestration:operate",
  }),
  "scheduledTasks.runNow": defineMethod({
    payload: ScheduledTaskIdInput,
    success: ScheduledTaskMutationResult,
    stream: false,
    scope: "orchestration:operate",
  }),
  "scheduledTasks.rotateWebhookToken": defineMethod({
    payload: ScheduledTaskIdInput,
    success: ScheduledTaskMutationResult,
    stream: false,
    scope: "orchestration:operate",
  }),
  "scheduledTasks.listWebhookDeliveries": defineMethod({
    payload: ScheduledTaskListWebhookDeliveriesInput,
    success: ScheduledTaskListWebhookDeliveriesResult,
    stream: false,
    scope: "orchestration:operate",
  }),
  "scheduledTasks.getWebhookDelivery": defineMethod({
    payload: ScheduledTaskGetWebhookDeliveryInput,
    success: ScheduledTaskGetWebhookDeliveryResult,
    stream: false,
    scope: "orchestration:operate",
  }),
} as const;
