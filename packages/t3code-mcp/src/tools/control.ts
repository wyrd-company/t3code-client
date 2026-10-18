// ---
// relationships:
//   implements: mcp
// ---
import { z } from "zod";
import { schemas, runtimeRequestId, runId, threadId } from "@wyrd-company/t3code-lib";
import { ToolError } from "../errors.ts";
import { requireThread } from "./selection.ts";
import { requestView } from "../views/thread.ts";
import { tool, threadArgs } from "./spec.ts";
export const controlTools = [
  tool(
    "thread_interrupt",
    "Interrupt the active run or the specified runId on a server. No active run is a no-op; work is not interrupted by thread_wait timeouts.",
    false,
    { ...threadArgs, runId: z.string().min(1).optional() },
    async (args, { registry, signal }) => {
      const server = registry.resolve(args.server);
      const client = await registry.client(server, "thread_interrupt", signal);
      const current = await requireThread(client, args.threadId, signal);
      const target = args.runId ?? current.activeRunId;
      if (target === null) return { server, threadId: args.threadId, interrupted: false };
      await client.threads.interrupt(threadId(args.threadId), runId(target), {}, signal);
      return { server, threadId: args.threadId, interrupted: true };
    },
  ),
  tool(
    "thread_update",
    "Rename, settle, unsettle, archive or unarchive a thread on a server. action:rename requires title. Settling is a user-visible thread marker, independent of terminal run status.",
    false,
    {
      ...threadArgs,
      action: z.enum(["rename", "settle", "unsettle", "archive", "unarchive"]),
      title: z.string().min(1).optional(),
    },
    async (args, { registry, signal }) => {
      if (args.action === "rename" && args.title === undefined)
        throw new ToolError("invalid_input", "Rename requires title.");
      const server = registry.resolve(args.server);
      const client = await registry.client(server, "thread_update", signal);
      const id = threadId(args.threadId);
      await requireThread(client, args.threadId, signal);
      if (args.action === "rename") await client.threads.update(id, { title: args.title! }, signal);
      else await client.threads[args.action](id, signal);
      return { server, threadId: id, action: args.action };
    },
  ),
  tool(
    "pending_request_list",
    "List a thread's open questions and approvals with requestId and answer choices. Answer questions with pending_request_respond; approvals require the opt-in approval_respond tool.",
    true,
    threadArgs,
    async (args, { registry, signal }) => {
      const server = registry.resolve(args.server);
      const client = await registry.client(server, "pending_request_list", signal);
      await requireThread(client, args.threadId, signal);
      return {
        server,
        threadId: args.threadId,
        requests: (await client.threads.pendingRequests(threadId(args.threadId), signal)).map(
          requestView,
        ),
      };
    },
  ),
  tool(
    "pending_request_respond",
    "Answer an open question on a thread. requestId comes from thread_wait/read or pending_request_list; answers maps question ids to JSON answer values. Then wait again for the thread to finish.",
    false,
    {
      ...threadArgs,
      requestId: z.string().min(1),
      answers: schemas.orchestrationModel.ProviderUserInputAnswers,
    },
    async (args, { registry, signal }) => {
      const server = registry.resolve(args.server);
      const client = await registry.client(server, "pending_request_respond", signal);
      const id = threadId(args.threadId);
      await requireThread(client, args.threadId, signal);
      const request = (await client.threads.pendingRequests(id, signal)).find(
        (r) => r.requestId === args.requestId,
      );
      if (!request) throw new ToolError("not_found", "Open request does not exist.");
      if (request.kind !== "user-input")
        throw new ToolError("invalid_state", "This request requires approval_respond.");
      await client.threads.respondToUserInput(
        { threadId: id, requestId: runtimeRequestId(args.requestId), answers: args.answers },
        signal,
      );
      return { server, threadId: id, requestId: args.requestId, responded: true };
    },
  ),
  tool(
    "approval_respond",
    "Accept or decline a pending approval request. Explicit operator opt-in is required to expose this tool. Use requestId from pending_request_list; never use this tool for questions.",
    false,
    {
      ...threadArgs,
      requestId: z.string().min(1),
      decision: z.enum(["accept", "acceptForSession", "acceptAlways", "decline", "cancel"]),
    },
    async (args, { registry, signal }) => {
      const server = registry.resolve(args.server);
      const client = await registry.client(server, "approval_respond", signal);
      const id = threadId(args.threadId);
      await requireThread(client, args.threadId, signal);
      const request = (await client.threads.pendingRequests(id, signal)).find(
        (r) => r.requestId === args.requestId,
      );
      if (!request) throw new ToolError("not_found", "Open request does not exist.");
      if (request.kind !== "approval")
        throw new ToolError("invalid_state", "This request requires pending_request_respond.");
      await client.threads.respondToApproval(
        { threadId: id, requestId: runtimeRequestId(args.requestId), decision: args.decision },
        signal,
      );
      return { server, threadId: id, requestId: args.requestId, responded: true };
    },
    true,
  ),
];
