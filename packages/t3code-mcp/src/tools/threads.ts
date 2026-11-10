// ---
// relationships:
//   implements: mcp
// ---
import { pendingRequests, schemas } from "@wyrd-company/t3code-lib";
import { z } from "zod";
import { ToolRefusal, refuseRpcError } from "../errors.ts";
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
    "thread_stop",
    "Request native Stop for active, queued or background work, including an idle thread. Returns acknowledgement, not terminal state.",
    z.strictObject({ threadId, reason: z.string().optional() }),
    async ({ threadId, reason }, client, signal) => {
      await client.threads.stopThread(threadId, reason === undefined ? {} : { reason }, signal);
      return { threadId };
    },
    false,
  ),
  defineTool(
    "thread_force_stop",
    "Force stop a thread whose agent ignored thread_stop: ends the turn and kills or releases its agent process. Use only after native Stop failed. With runId, refuses with code superseded once another run is the latest. Returns outcome killed, released, releasing or shared, and sharedWithThreadIds.",
    z.strictObject({ threadId, runId: schemas.common.RunId.optional() }),
    ({ threadId, runId }, client, signal) =>
      refuseRpcError(
        client.threads.forceStop(threadId, runId === undefined ? {} : { runId }, signal),
        (error) =>
          error.is("OrchestrationV2ForceStopThreadError") && error.record.reason === "superseded"
            ? new ToolRefusal("superseded", "Another run is the latest; nothing was stopped.")
            : undefined,
      ),
    false,
  ),
  defineTool(
    "thread_queue_resume",
    "Request queue Resume. Clears the hold on all queued runs; queued messages may run. Returns acknowledgement, not completion.",
    threadInput,
    async ({ threadId }, client, signal) => {
      await client.threads.resumeQueue(threadId, signal);
      return { threadId };
    },
    false,
  ),
  defineTool(
    "thread_queue_start",
    "Request Start for a selected queued plain user message on a stopped thread. Select runId from thread_status queuedRuns or stock queuedRunId. Clears the hold on ALL queued runs: the selected message goes first and others may follow. Returns acknowledgement, not completion.",
    z.strictObject({ threadId, runId: schemas.common.RunId }),
    async ({ threadId, runId }, client, signal) => {
      await client.threads.startQueuedRun(threadId, runId, signal);
      return { threadId, runId };
    },
    false,
  ),
  defineTool(
    "thread_status",
    "Read structured active/latest runs, queued runs, held state, pending request counts and server-derived background work.",
    threadInput,
    ({ threadId }, client, signal) => client.threads.status(threadId, signal),
  ),
  defineTool(
    "thread_family",
    "Read a thread's whole family in one read: the root, its forks and their subagent trees, in any run state, including idle subagent children. Returns thread summaries and snapshotSequence; an unknown thread has an empty family.",
    threadInput,
    ({ threadId }, client, signal) => client.shell.threadFamily(threadId, signal),
  ),
  defineTool(
    "worktree_threads",
    "List the ids of the active threads on a worktree path, including subagent children. Check it before you remove a worktree. The path must equal the thread's stored worktree path.",
    z.strictObject({ worktreePath: schemas.common.TrimmedNonEmptyString }),
    async ({ worktreePath }, client, signal) => ({
      threadIds: await client.shell.worktreeThreadIds(worktreePath, signal),
    }),
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
