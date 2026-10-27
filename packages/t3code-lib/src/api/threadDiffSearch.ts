// ---
// relationships:
//   implements: automation-capabilities
// ---
/** Checkpoint diffs and thread search through the typed RPC registry. */
import type { RpcClient } from "../rpc/client.ts";
import type { RpcMethods } from "../rpc/registry.ts";
import type { ThreadId } from "../schemas/common.ts";
import type { OrchestrationV2ThreadProjection } from "../schemas/orchestration/projection.ts";
import type {
  OrchestrationSearchThreadsInput,
  OrchestrationSearchThreadsResult,
  ThreadTurnDiff,
} from "../schemas/orchestration/stream.ts";
import type {
  OrchestrationV2SearchThreadInput,
  OrchestrationV2SearchThreadResult,
} from "../schemas/orchestration/threadFind.ts";

/** Checkpoint turn counts: 0 is the thread start, n is the nth app run's checkpoint. */
export interface ThreadDiffRange {
  readonly fromTurnCount: number;
  readonly toTurnCount: number;
}

export type ThreadDiff = ThreadTurnDiff;

export type ThreadSearchInput = OrchestrationSearchThreadsInput;

/** The server's matches, with the limit that bounded them. */
export interface ThreadSearchResult extends OrchestrationSearchThreadsResult {
  /** At most this many matches; a result of this length can omit further matches. */
  readonly limit: number;
}

export type ThreadContentSearchInput = OrchestrationV2SearchThreadInput;
export type ThreadContentSearchResult = OrchestrationV2SearchThreadResult;

/** The server's default and maximum `orchestration.searchThreads` limit. */
export const THREAD_SEARCH_MAX_LIMIT = 50;

/**
 * The highest turn count the server can diff to: the largest app run ordinal of a
 * ready checkpoint whose run completed. 0 when there is none.
 */
export function latestDiffTurnCount(
  projection: Pick<OrchestrationV2ThreadProjection, "runs" | "checkpoints">,
): number {
  const completed = new Set(
    projection.runs.filter((run) => run.status === "completed").map((run) => run.id),
  );
  let latest = 0;
  for (const checkpoint of projection.checkpoints) {
    if (checkpoint.status !== "ready" || checkpoint.appRunOrdinal === null) continue;
    if (checkpoint.runId === null || !completed.has(checkpoint.runId)) continue;
    latest = Math.max(latest, checkpoint.appRunOrdinal);
  }
  return latest;
}

export function loadThreadDiff(
  rpc: RpcClient<RpcMethods>,
  threadId: ThreadId,
  range: ThreadDiffRange,
  signal?: AbortSignal,
): Promise<ThreadDiff> {
  return rpc.call(
    "orchestration.getTurnDiff",
    { threadId, fromTurnCount: range.fromTurnCount, toTurnCount: range.toTurnCount },
    signal,
  );
}

export function loadFullThreadDiff(
  rpc: RpcClient<RpcMethods>,
  threadId: ThreadId,
  toTurnCount: number,
  signal?: AbortSignal,
): Promise<ThreadDiff> {
  return rpc.call("orchestration.getFullThreadDiff", { threadId, toTurnCount }, signal);
}

export async function searchThreads(
  rpc: RpcClient<RpcMethods>,
  input: ThreadSearchInput,
  signal?: AbortSignal,
): Promise<ThreadSearchResult> {
  const limit = input.limit ?? THREAD_SEARCH_MAX_LIMIT;
  const result = await rpc.call("orchestration.searchThreads", { ...input, limit }, signal);
  return { ...result, limit };
}

export function searchThreadContent(
  rpc: RpcClient<RpcMethods>,
  input: ThreadContentSearchInput,
  signal?: AbortSignal,
): Promise<ThreadContentSearchResult> {
  return rpc.call("orchestration.searchThread", input, signal);
}
