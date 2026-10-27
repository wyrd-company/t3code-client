// ---
// relationships:
//   implements: mcp
// ---
import { pendingRequests, schemas } from "@wyrd-company/t3code-lib";
import { z } from "zod";
import { defineTool } from "../tool.ts";

const threadId = schemas.common.ThreadId;
const threadInput = z.strictObject({ threadId });
const turn = z.number().int().nonnegative();
const range = z
  .strictObject({ fromTurnCount: turn, toTurnCount: turn })
  .refine((v) => v.fromTurnCount <= v.toTurnCount, {
    message: "fromTurnCount must not exceed toTurnCount",
  });

export const threadTools = [
  defineTool(
    "thread_status",
    "Read structured active/latest runs, queued runs, held state, pending request counts and server-derived background work.",
    threadInput,
    ({ threadId }, client, signal) => client.threads.status(threadId, signal),
  ),
  defineTool(
    "thread_approvals",
    "Read pending approvals and their full prompts for human review. Does not answer approvals or change permissions. Use stock tools for questions.",
    threadInput,
    async ({ threadId }, client, signal) => ({
      approvals: pendingRequests((await client.threads.detail(threadId, signal)).projection).filter(
        (request) => request.kind === "approval",
      ),
    }),
  ),
  defineTool(
    "thread_usage",
    "Read provider-thread context usage and provider-turn token/cost records, preserving ownership and provenance. Missing values stay absent or null; records are not totalled.",
    threadInput,
    ({ threadId }, client, signal) => client.threads.usage(threadId, signal),
  ),
  defineTool(
    "thread_diff",
    "Read the full diff through the latest completed ready checkpoint, or an explicit checkpoint turn-count range. Zero means the thread start.",
    z.strictObject({ threadId, range: range.optional() }),
    ({ threadId, range }, client, signal) => client.threads.diff(threadId, range, signal),
  ),
  defineTool(
    "thread_search_content",
    "Search within one thread. Returns total count and one selected match with native navigation bounds, not a transcript. Use stock search for cross-thread discovery.",
    schemas.orchestrationThreadFind.OrchestrationV2SearchThreadInput.strict(),
    (input, client, signal) => client.threads.searchContent(input, signal),
  ),
] as const;
