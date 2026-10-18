// ---
// relationships:
//   implements: mcp
// ---
import { z } from "zod";
import { T3HttpError, projectId, threadId, type ThreadListOptions } from "@wyrd-company/t3code-lib";
import { threadView, projectionView, trimItem } from "../views/thread.ts";
import { tool, serverArg, threadArgs, pageArgs, page } from "./spec.ts";

export const readTools = [
  tool(
    "thread_list",
    "List threads newest first on a server, filtered by projectId, status, title substring and settled flag. includeArchived adds archived threads; offset/limit paginate.",
    true,
    {
      server: serverArg,
      ...pageArgs,
      projectId: z.string().optional(),
      status: z.string().optional(),
      title: z.string().optional(),
      settled: z.boolean().optional(),
      includeArchived: z.boolean().default(false),
    },
    async (args, { registry, signal }) => {
      const server = registry.resolve(args.server);
      const client = await registry.client(server, "thread_list");
      const options: ThreadListOptions = {
        includeArchived: args.includeArchived,
        ...(args.projectId === undefined ? {} : { projectId: projectId(args.projectId) }),
      };
      const rows = (await client.threads.list(options, signal))
        .map((thread) => threadView(server, thread))
        .filter(
          (t) =>
            (args.status === undefined || t.status === args.status) &&
            (args.title === undefined ||
              t.title.toLowerCase().includes(args.title.toLowerCase())) &&
            (args.settled === undefined || t.settled === args.settled),
        )
        .sort(
          (a, b) => b.updatedAt.localeCompare(a.updatedAt) || a.threadId.localeCompare(b.threadId),
        );
      return { server, ...page(rows, args.offset, args.limit) };
    },
  ),
  tool(
    "thread_read",
    "Read thread state, pending requests and a chronological paginated timeline. view:messages returns user/assistant text; activity includes tool and other rows. Long item text is cut at maxCharsPerItem (default 4000), with truncatedItemIds. Use after thread_wait to read the answer.",
    true,
    {
      ...threadArgs,
      ...pageArgs,
      view: z.enum(["messages", "activity"]).default("messages"),
      maxCharsPerItem: z.int().positive().default(4000),
    },
    async (args, { registry, signal }) => {
      const server = registry.resolve(args.server);
      const client = await registry.client(server, "thread_read");
      const id = threadId(args.threadId);
      const detail = await client.threads.detail(id, signal);
      let rows;
      try {
        rows = (await client.threads.transcript(id, signal)).items;
      } catch (error) {
        if (!(error instanceof T3HttpError) || error.reason !== "thread_transcript_too_large")
          throw error;
        rows = detail.projection.visibleTurnItems;
      }
      const filtered = rows.filter(
        ({ item }) =>
          args.view === "activity" ||
          item.type === "user_message" ||
          item.type === "assistant_message",
      );
      const selected = page(filtered, args.offset, args.limit);
      const truncatedItemIds: string[] = [];
      const items = selected.items.map(({ item }) => {
        const cut = trimItem(item, args.maxCharsPerItem);
        if (cut.truncated) truncatedItemIds.push(item.id);
        return cut.value;
      });
      return { ...projectionView(server, detail.projection), ...selected, items, truncatedItemIds };
    },
  ),
];
