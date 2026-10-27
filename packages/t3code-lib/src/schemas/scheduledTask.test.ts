// ---
// relationships:
//   verifies: library
// ---
import { describe, expect, it } from "vite-plus/test";

import {
  deliverySummary,
  intervalTask,
  webhookTask,
} from "../../test/support/scheduledTaskFixtures.ts";
import { decodeRpcErrorRecord } from "./rpcErrors.ts";
import {
  ScheduledTaskListResult,
  ScheduledTaskSchedule,
  ScheduledTaskUpsertSchedule,
  ScheduledTaskWebhookDeliverySummary,
  isWebhookDedupeTemplate,
} from "./scheduledTask.ts";

describe("scheduled task schemas", () => {
  it("decodes stored triggers, keeping a legacy sub-minute interval", () => {
    expect(ScheduledTaskSchedule.parse({ type: "interval", everyMs: 1_000 })).toEqual({
      type: "interval",
      everyMs: 1_000,
    });
    expect(ScheduledTaskSchedule.parse(webhookTask.schedule)).toEqual(webhookTask.schedule);
  });

  it("keeps newer trigger types, filter operators and signature encodings", () => {
    expect(ScheduledTaskSchedule.parse({ type: "calendar_event", sample: 1 })).toEqual({
      unknown: true,
      raw: { type: "calendar_event", sample: 1 },
    });
    const schedule = ScheduledTaskSchedule.parse({
      ...webhookTask.schedule,
      signature: { header: "x-sample", encoding: "base32", prefix: "" },
      filters: [{ path: "body.sample", op: "matches", value: "^a" }],
    });
    expect(schedule).toMatchObject({
      signature: { encoding: "base32" },
      filters: [{ unknown: true, raw: { op: "matches" } }],
    });
  });

  it("fails a known trigger whose fields do not match", () => {
    expect(
      ScheduledTaskSchedule.safeParse({ type: "fixed_time", timeOfDay: "25:00" }).success,
    ).toBe(false);
  });

  it("drops an undecodable task from a list instead of failing it", () => {
    const result = ScheduledTaskListResult.parse({
      tasks: [intervalTask, { ...intervalTask, id: "" }, webhookTask],
    });
    expect(result.tasks.map((task) => task.id)).toEqual([intervalTask.id, webhookTask.id]);
  });

  it("applies the server's write bounds", () => {
    const valid = (value: unknown) => ScheduledTaskUpsertSchedule.safeParse(value).success;
    expect(valid({ type: "interval", everyMs: 60_000 })).toBe(true);
    expect(valid({ type: "interval", everyMs: 59_999 })).toBe(false);
    expect(valid({ type: "fixed_time", timeOfDay: "9:05", weekdays: [0, 6] })).toBe(true);
    expect(valid({ type: "fixed_time", timeOfDay: "09:05", weekdays: [7] })).toBe(false);
    expect(valid({ type: "webhook" })).toBe(true);
    expect(valid({ type: "webhook", maxDeliveryAgeMinutes: 1_441 })).toBe(false);
    expect(valid({ type: "webhook", filters: [{ path: "body.a", op: "in", value: [] }] })).toBe(
      false,
    );
    expect(valid({ type: "webhook", filters: [{ path: "env.a", op: "exists" }] })).toBe(false);
    expect(
      valid({
        type: "webhook",
        filters: Array.from({ length: 17 }, () => ({ path: "body", op: "exists" })),
      }),
    ).toBe(false);
    expect(valid({ type: "webhook", dedupe: { coalesceWindowSeconds: 5 } })).toBe(false);
    expect(
      valid({
        type: "webhook",
        signature: { header: "x-sample", encoding: "base32", prefix: "" },
      }),
    ).toBe(false);
  });

  it("accepts only placeholder-based dedupe templates", () => {
    expect(isWebhookDedupeTemplate("{{headers.x-sample-id}}")).toBe(true);
    expect(isWebhookDedupeTemplate("sample:{{body.sample.id}}:{{request}}")).toBe(true);
    expect(isWebhookDedupeTemplate("constant")).toBe(false);
    expect(isWebhookDedupeTemplate("{{env.SAMPLE}}")).toBe(false);
  });

  it("decodes delivery outcomes as a growing set", () => {
    expect(
      ScheduledTaskWebhookDeliverySummary.parse({ ...deliverySummary, outcome: "quarantined" }),
    ).toMatchObject({ outcome: "quarantined" });
  });

  it("registers ScheduledTaskError and UsageReadError as known RPC failures", () => {
    expect(
      decodeRpcErrorRecord({ _tag: "ScheduledTaskError", message: "Sample", taskId: "sample" }),
    ).toEqual({ _tag: "ScheduledTaskError", message: "Sample", taskId: "sample" });
    expect(
      decodeRpcErrorRecord({ _tag: "UsageReadError", reason: "scanFailed", detail: "Sample" }),
    ).toEqual({ _tag: "UsageReadError", reason: "scanFailed", detail: "Sample" });
  });
});
