// ---
// relationships:
//   implements: library-transport
// ---
/**
 * The four methods of a webhook task's endpoint. The path holds the token, and a signature in a
 * header can also be required, so these routes send no session token. The server reads the body
 * as raw bytes: `headers` names their `content-type` and carries any signature.
 */
import { z } from "zod";

import { T3PreconditionError } from "../../errors.ts";
import { TrimmedNonEmptyString } from "../../schemas/common.ts";
import { ScheduledTaskWebhookAccepted } from "../../schemas/scheduledTask.ts";
import { defineRoute } from "../spec.ts";

const PATH = "/api/hooks/:hookId/:token";
const WEBHOOK_PREFIX = "/api/hooks/";

const request = {
  params: z.strictObject({ hookId: TrimmedNonEmptyString, token: TrimmedNonEmptyString }),
  query: z.record(z.string(), z.string()).optional(),
  headers: z.record(z.string(), z.string()).optional(),
};
const requestWithBody = z.strictObject({
  ...request,
  body: z.instanceof(Uint8Array).optional(),
});

export const webhookRoutes = {
  "webhooks.webhookPost": defineRoute({
    method: "POST",
    path: PATH,
    auth: "none",
    input: requestWithBody,
    success: ScheduledTaskWebhookAccepted,
    signedPath: true,
  }),
  "webhooks.webhookPut": defineRoute({
    method: "PUT",
    path: PATH,
    auth: "none",
    input: requestWithBody,
    success: ScheduledTaskWebhookAccepted,
    signedPath: true,
  }),
  "webhooks.webhookPatch": defineRoute({
    method: "PATCH",
    path: PATH,
    auth: "none",
    input: requestWithBody,
    success: ScheduledTaskWebhookAccepted,
    signedPath: true,
  }),
  "webhooks.webhookGet": defineRoute({
    method: "GET",
    path: PATH,
    auth: "none",
    input: z.strictObject(request),
    success: ScheduledTaskWebhookAccepted,
    signedPath: true,
  }),
};

/** The route params of a webhook endpoint's `path`, from `scheduledTasks.webhookEndpoint`. */
export function webhookUrlParams(path: string): { hookId: string; token: string } {
  const [hookId, token, ...rest] = path.startsWith(WEBHOOK_PREFIX)
    ? path.slice(WEBHOOK_PREFIX.length).split("/")
    : [];
  if (hookId === undefined || token === undefined || rest.length > 0) {
    // The path holds the token, so this message does not quote it.
    throw new T3PreconditionError("The value is not a webhook endpoint path.");
  }
  return { hookId: decodeURIComponent(hookId), token: decodeURIComponent(token) };
}
