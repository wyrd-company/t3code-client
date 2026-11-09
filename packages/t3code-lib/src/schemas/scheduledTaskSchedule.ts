// ---
// relationships:
//   implements: library
// ---
/**
 * Mirrors the trigger half of `packages/contracts/src/scheduledTask.ts`: the
 * interval, fixed-time, one-time and webhook schedules, as stored (read) and as sent
 * (write). Read schemas keep newer trigger types, filter operators and
 * encodings; write schemas apply the server's input bounds before sending.
 */
import { z } from "zod";
import {
  SecretRef,
  TrimmedNonEmptyString,
  forwardCompatibleLiteral,
  taggedUnionWithUnknown,
} from "./common.ts";

export const MIN_SCHEDULED_TASK_INTERVAL_MS = 60_000;
/** Matches how long the relay holds a request for an offline environment. */
export const MAX_WEBHOOK_DELIVERY_AGE_MINUTES = 24 * 60;
export const MAX_WEBHOOK_FILTERS = 16;

/** 24-hour "HH:MM" wall-clock time, such as 09:30. */
const TimeOfDay = TrimmedNonEmptyString.regex(/^([01]?\d|2[0-3]):([0-5]\d)$/);
const IntervalMs = z.number().int().positive();
/** Weekday number where 0 is Sunday and 6 is Saturday. */
const Weekday = z.number().int().min(0).max(6);

/** `true` when a dedupe template is only body, headers, query and request placeholders plus literal text. */
export function isWebhookDedupeTemplate(template: string): boolean {
  const placeholders = /\{\{\s*(?:(?:body|headers|query)(?:\.[^{}.\s]+)*|request)\s*\}\}/g;
  const matches = [...template.matchAll(placeholders)];
  const remainder = template.replace(placeholders, "");
  return matches.length > 0 && !remainder.includes("{{") && !remainder.includes("}}");
}

const WebhookDedupeTemplate = z.string().refine(isWebhookDedupeTemplate, {
  message: "Expected a template with body, headers, query or request placeholders",
});

/** Replay key (kept 7 days), coalesce key and coalesce window in seconds (server default 120). */
export const ScheduledTaskWebhookDedupe = z.looseObject({
  replayKey: WebhookDedupeTemplate.optional(),
  coalesceKey: WebhookDedupeTemplate.optional(),
  coalesceWindowSeconds: z.number().int().min(10).max(3600).optional(),
});
export type ScheduledTaskWebhookDedupe = z.infer<typeof ScheduledTaskWebhookDedupe>;

/** Request value in placeholder syntax without braces; `[]` fans out over an array. */
const WebhookFilterPath = TrimmedNonEmptyString.regex(/^(body|headers|query)(\.|$)/);
/** Non-empty, without commas or surrounding whitespace. */
const WebhookFilterListValue = z.string().regex(/^[^,\s](?:[^,]*[^,\s])?$/);

const webhookFilterMembers = [
  z.looseObject({
    path: WebhookFilterPath,
    op: z.enum(["equals", "notEquals", "startsWith"]),
    value: z.string(),
  }),
  z.looseObject({
    path: WebhookFilterPath,
    op: z.literal("in"),
    value: z.array(WebhookFilterListValue).min(1),
  }),
  z.looseObject({ path: WebhookFilterPath, op: z.literal("exists") }),
] as const;

/** A filter as sent. Every filter must match for a request to run the task. */
export const ScheduledTaskWebhookFilter = z.discriminatedUnion("op", webhookFilterMembers);
export type ScheduledTaskWebhookFilter = z.infer<typeof ScheduledTaskWebhookFilter>;
export type ScheduledTaskWebhookFilterOp = ScheduledTaskWebhookFilter["op"];
/** A stored filter; a newer operator decodes as `{ unknown: true, raw }`. */
export const ScheduledTaskWebhookFilterRecord = taggedUnionWithUnknown("op", webhookFilterMembers);
export type ScheduledTaskWebhookFilterRecord = z.infer<typeof ScheduledTaskWebhookFilterRecord>;

const signatureFields = {
  /** Request header carrying the signature, such as x-hub-signature-256. */
  header: TrimmedNonEmptyString,
  /** Text before the digest in the header value, such as `sha256=`. Empty for none. */
  prefix: z.string(),
};

/** Stored HMAC-SHA256 check over the raw request body. The secret is never returned. */
export const ScheduledTaskWebhookSignature = z.looseObject({
  ...signatureFields,
  encoding: forwardCompatibleLiteral(["hex", "base64"]),
});
export type ScheduledTaskWebhookSignature = z.infer<typeof ScheduledTaskWebhookSignature>;

/**
 * Signature check as sent. Omit `secret` and `secretRef` to keep the stored
 * secret; `secretRef` is consumed by the save that uses it.
 */
export const ScheduledTaskWebhookSignatureInput = z.looseObject({
  ...signatureFields,
  encoding: z.enum(["hex", "base64"]),
  secret: TrimmedNonEmptyString.optional(),
  secretRef: SecretRef.optional(),
});
export type ScheduledTaskWebhookSignatureInput = z.infer<typeof ScheduledTaskWebhookSignatureInput>;

/** Skip requests the relay held longer than this while offline; null runs every request. */
const MaxDeliveryAgeMinutes = z.number().int().min(1).max(MAX_WEBHOOK_DELIVERY_AGE_MINUTES);

export const ScheduledTaskIntervalSchedule = z.looseObject({
  type: z.literal("interval"),
  everyMs: IntervalMs,
});
export const ScheduledTaskFixedTimeSchedule = z.looseObject({
  type: z.literal("fixed_time"),
  timeOfDay: TimeOfDay,
  /** Omit to run every day. */
  weekdays: z.array(Weekday).optional(),
});
const ISO_WITH_OFFSET =
  /^(\d{4})-(\d{2})-(\d{2})T([01]\d|2[0-3]):[0-5]\d(:[0-5]\d(\.\d+)?)?(Z|[+-]\d{2}:\d{2})$/;
const YEAR_0000 = Date.parse("0000-01-01T00:00:00Z");
const YEAR_10000 = Date.parse("+010000-01-01T00:00:00Z");

/**
 * `true` for an ISO date and time with an offset, such as
 * `2030-01-31T09:30:00+02:00`, on a real calendar day whose UTC form keeps a
 * four-digit year.
 */
export function isIsoDateTimeWithOffset(value: string): boolean {
  const match = ISO_WITH_OFFSET.exec(value);
  const time = Date.parse(value);
  if (!match || !(time >= YEAR_0000 && time < YEAR_10000)) return false;
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1];
  return days !== undefined && day >= 1 && day <= days;
}

/** Runs once at `runAt`. Servers that report `oneTimeSchedules` accept it. */
export const ScheduledTaskOnceSchedule = z.looseObject({
  type: z.literal("once"),
  runAt: TrimmedNonEmptyString.refine(isIsoDateTimeWithOffset, {
    message: "Expected an ISO date and time with an offset",
  }),
});
export const ScheduledTaskWebhookSchedule = z.looseObject({
  type: z.literal("webhook"),
  signature: ScheduledTaskWebhookSignature.nullable(),
  maxDeliveryAgeMinutes: MaxDeliveryAgeMinutes.nullable().optional(),
  dedupe: ScheduledTaskWebhookDedupe.optional(),
  filters: z.array(ScheduledTaskWebhookFilterRecord).max(MAX_WEBHOOK_FILTERS).optional(),
});
export type ScheduledTaskWebhookSchedule = z.infer<typeof ScheduledTaskWebhookSchedule>;

/**
 * A stored trigger. Sub-minute legacy intervals still decode so they can be
 * listed, disabled, edited or deleted. A newer trigger type decodes as
 * `{ unknown: true, raw }`.
 */
export const ScheduledTaskSchedule = taggedUnionWithUnknown("type", [
  ScheduledTaskIntervalSchedule,
  ScheduledTaskFixedTimeSchedule,
  ScheduledTaskOnceSchedule,
  ScheduledTaskWebhookSchedule,
]);
export type ScheduledTaskSchedule = z.infer<typeof ScheduledTaskSchedule>;

/**
 * A webhook trigger as sent. The server clears an omitted or null
 * `signature` and an omitted or null `maxDeliveryAgeMinutes`; it keeps the
 * stored `dedupe` and `filters` when they are omitted, and `filters: []`
 * clears them.
 */
export const ScheduledTaskUpsertWebhookSchedule = z.looseObject({
  type: z.literal("webhook"),
  signature: ScheduledTaskWebhookSignatureInput.nullable().optional(),
  maxDeliveryAgeMinutes: MaxDeliveryAgeMinutes.nullable().optional(),
  dedupe: ScheduledTaskWebhookDedupe.optional(),
  filters: z.array(ScheduledTaskWebhookFilter).max(MAX_WEBHOOK_FILTERS).optional(),
});
export type ScheduledTaskUpsertWebhookSchedule = z.infer<typeof ScheduledTaskUpsertWebhookSchedule>;

/** A writable trigger; intervals are at least one minute. */
export const ScheduledTaskUpsertSchedule = z.discriminatedUnion("type", [
  z.looseObject({
    type: z.literal("interval"),
    everyMs: IntervalMs.min(MIN_SCHEDULED_TASK_INTERVAL_MS),
  }),
  ScheduledTaskFixedTimeSchedule,
  ScheduledTaskOnceSchedule,
  ScheduledTaskUpsertWebhookSchedule,
]);
export type ScheduledTaskUpsertSchedule = z.infer<typeof ScheduledTaskUpsertSchedule>;
