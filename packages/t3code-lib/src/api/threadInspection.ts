// ---
// relationships:
//   implements: automation-capabilities
// ---
/**
 * Structured thread inspection: run, queue, request and background-work status,
 * and provider usage with owning ids. Both read the full HTTP detail, because the
 * bounded RPC projection omits older provider threads and turns.
 */
import type {
  NodeId,
  ProviderInstanceId,
  ProviderThreadId,
  ProviderTurnId,
  RunAttemptId,
  RunId,
  ThreadId,
} from "../schemas/common.ts";
import type { OrchestrationV2ThreadProjection } from "../schemas/orchestration/projection.ts";
import type {
  OrchestrationV2PendingBackgroundTask,
  OrchestrationV2ProviderThread,
  OrchestrationV2ProviderTurn,
  OrchestrationV2ProviderTurnTokenUsage,
} from "../schemas/orchestration/providerState.ts";
import type {
  ThreadTokenUsageSnapshot,
  TurnTokenUsage,
} from "../schemas/orchestration/providerRuntime.ts";
import type { OrchestrationV2Run } from "../schemas/orchestration/runs.ts";
import type { OrchestrationV2AppThread } from "../schemas/orchestration/thread.ts";
import type { OrchestrationV2ThreadShell } from "../schemas/orchestration/shell.ts";
import { activeRun, pendingRequests } from "./threadDerived.ts";

/** Open runtime requests by kind. Every request kind other than `user_input` is an approval. */
export interface ThreadPendingRequestCounts {
  readonly approvals: number;
  readonly questions: number;
}

export interface ThreadStatus {
  /** Identity and configuration: project, provider, model, modes, branch and worktree. */
  readonly thread: OrchestrationV2AppThread;
  readonly snapshotSequence: number;
  /** The preparing, starting, running or waiting run with the highest ordinal. */
  readonly activeRun: OrchestrationV2Run | null;
  /** The highest-ordinal run that is not queued, in any status. */
  readonly latestRun: OrchestrationV2Run | null;
  /** Queued runs by queue position, then ordinal. */
  readonly queuedRuns: readonly OrchestrationV2Run[];
  /** True when a queued run is held, as after Stop; the server starts no queued run. */
  readonly queueHeld: boolean;
  readonly pendingRequests: ThreadPendingRequestCounts;
  /**
   * The server's derived pending background work from the thread shell. Null when
   * the shell does not list the thread, so the server's derivation is unavailable.
   */
  readonly backgroundWork: readonly OrchestrationV2PendingBackgroundTask[] | null;
}

/** One provider thread's latest context usage. Null usage means none was reported. */
export interface ThreadProviderThreadUsage {
  readonly providerThreadId: ProviderThreadId;
  readonly providerInstanceId: ProviderInstanceId;
  readonly appThreadId: ThreadId | null;
  readonly ownerNodeId: NodeId | null;
  readonly status: OrchestrationV2ProviderThread["status"];
  readonly contextUsage: ThreadTokenUsageSnapshot | null;
}

/**
 * One provider turn's usage. `tokenUsage` and `turnTokenUsage` are absent when the
 * provider did not report them; absence is not zero usage.
 */
export interface ThreadProviderTurnUsage {
  readonly providerTurnId: ProviderTurnId;
  readonly providerThreadId: ProviderThreadId;
  readonly nodeId: NodeId;
  readonly runAttemptId: RunAttemptId | null;
  /** The run that owns the attempt; null when the turn has no attempt in the projection. */
  readonly runId: RunId | null;
  readonly ordinal: number;
  readonly status: OrchestrationV2ProviderTurn["status"];
  readonly startedAt: string | null;
  readonly completedAt: string | null;
  readonly tokenUsage?: OrchestrationV2ProviderTurnTokenUsage;
  readonly turnTokenUsage?: TurnTokenUsage;
}

/** Usage records as the provider reported them. The library adds no totals. */
export interface ThreadUsage {
  readonly threadId: ThreadId;
  readonly providerThreads: readonly ThreadProviderThreadUsage[];
  readonly providerTurns: readonly ThreadProviderTurnUsage[];
}

export function threadStatus(
  snapshot: {
    readonly snapshotSequence: number;
    readonly projection: OrchestrationV2ThreadProjection;
  },
  shell: Pick<OrchestrationV2ThreadShell, "pendingBackgroundTasks"> | undefined,
): ThreadStatus {
  const { projection } = snapshot;
  const queuedRuns = projection.runs
    .filter((run) => run.status === "queued")
    .sort(
      (a, b) =>
        (a.queuePosition ?? Number.MAX_SAFE_INTEGER) -
          (b.queuePosition ?? Number.MAX_SAFE_INTEGER) || a.ordinal - b.ordinal,
    );
  let latestRun: OrchestrationV2Run | null = null;
  for (const run of projection.runs) {
    if (run.status === "queued") continue;
    if (latestRun === null || run.ordinal > latestRun.ordinal) latestRun = run;
  }
  const requests = pendingRequests(projection);
  return {
    thread: projection.thread,
    snapshotSequence: snapshot.snapshotSequence,
    activeRun: activeRun(projection) ?? null,
    latestRun,
    queuedRuns,
    queueHeld: queuedRuns.some((run) => run.queueHeld === true),
    pendingRequests: {
      approvals: requests.filter((request) => request.kind === "approval").length,
      questions: requests.filter((request) => request.kind === "user-input").length,
    },
    backgroundWork: shell === undefined ? null : shell.pendingBackgroundTasks,
  };
}

export function threadUsage(projection: OrchestrationV2ThreadProjection): ThreadUsage {
  const runByAttempt = new Map(projection.attempts.map((attempt) => [attempt.id, attempt.runId]));
  return {
    threadId: projection.thread.id,
    providerThreads: projection.providerThreads.map((thread) => ({
      providerThreadId: thread.id,
      providerInstanceId: thread.providerInstanceId,
      appThreadId: thread.appThreadId,
      ownerNodeId: thread.ownerNodeId,
      status: thread.status,
      contextUsage: thread.contextUsage,
    })),
    providerTurns: projection.providerTurns.map((turn) => ({
      providerTurnId: turn.id,
      providerThreadId: turn.providerThreadId,
      nodeId: turn.nodeId,
      runAttemptId: turn.runAttemptId,
      runId: turn.runAttemptId === null ? null : (runByAttempt.get(turn.runAttemptId) ?? null),
      ordinal: turn.ordinal,
      status: turn.status,
      startedAt: turn.startedAt,
      completedAt: turn.completedAt,
      ...(turn.tokenUsage === undefined ? {} : { tokenUsage: turn.tokenUsage }),
      ...(turn.turnTokenUsage === undefined ? {} : { turnTokenUsage: turn.turnTokenUsage }),
    })),
  };
}
