// ---
// relationships:
//   implements: mcp
// ---
import { schemas } from "@wyrd-company/t3code-lib";
import { z } from "zod";
import { defineTool } from "../tool.ts";

const tag = schemas.orchestrationThreadTags.ThreadTag;

export const threadTagTools = [
  defineTool(
    "thread_tag",
    "Add (tagged true) or remove (tagged false) one tag on a thread, for example to group the threads you launch. Tags are trimmed, one line, at most 64 characters and match by exact spelling and case. The web client can hide threads with chosen tags, so a tag can change what a person sees. Returns the thread's tags after the change.",
    z.strictObject({ threadId: schemas.common.ThreadId, tag, tagged: z.boolean() }),
    async ({ threadId, tag, tagged }, client, signal) => ({
      threadId,
      tags: await client.threads.setTag(threadId, tag, tagged, signal),
    }),
    "idempotentWrite",
  ),
  defineTool(
    "tagged_threads",
    "List the threads that carry a tag, matched by exact spelling and case. Active threads only unless includeArchived. Returns at most limit (default 100, max 500) summaries with threadId, title, projectId, status, archived and tags, the total and truncated.",
    z.strictObject({
      tag,
      includeArchived: z.boolean().optional(),
      limit: z.number().int().min(1).max(500).optional(),
    }),
    async ({ tag, includeArchived, limit = 100 }, client, signal) => {
      const threads = await client.threads.list(
        { tag, ...(includeArchived === undefined ? {} : { includeArchived }) },
        signal,
      );
      return {
        threads: threads.slice(0, limit).map((thread) => ({
          threadId: thread.id,
          title: thread.title,
          projectId: thread.projectId,
          status: thread.status,
          archived: thread.archivedAt !== null,
          tags: thread.tags ?? [],
        })),
        total: threads.length,
        truncated: threads.length > limit,
      };
    },
  ),
] as const;
