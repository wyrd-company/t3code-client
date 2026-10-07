/**
 * Values derived from a thread projection or shell: open requests, the
 * outcome of a settled run, and the phase of a shell thread. Pure functions.
 */
import type { RunId, RuntimeRequestId } from "../schemas/common.ts";
import type { OrchestrationV2ConversationMessage } from "../schemas/orchestration/messages.ts";
import type { OrchestrationV2RuntimeRequest } from "../schemas/orchestration/providerState.ts";
import type { OrchestrationV2ThreadProjection } from "../schemas/orchestration/projection.ts";
import {
  isRunTerminalStatus,
  type OrchestrationV2Run,
  type OrchestrationV2RunTerminalStatus,
} from "../schemas/orchestration/runs.ts";
import type { OrchestrationV2ThreadShell } from "../schemas/orchestration/shell.ts";
import {
  isTurnItemOfType,
  type OrchestrationV2TurnItemOfType,
} from "../schemas/orchestration/turnItems.ts";

export type PendingRequest =
  | {
      readonly kind: "approval";
      readonly requestId: RuntimeRequestId;
      readonly request: OrchestrationV2RuntimeRequest;
      /** The timeline row with the prompt and options, when the projection holds it. */
      readonly item: OrchestrationV2TurnItemOfType<"approval_request"> | undefined;
    }
  | {
      readonly kind: "user-input";
      readonly requestId: RuntimeRequestId;
      readonly request: OrchestrationV2RuntimeRequest;
      readonly item: OrchestrationV2TurnItemOfType<"user_input_request"> | undefined;
      readonly questions: OrchestrationV2TurnItemOfType<"user_input_request">["questions"];
    };

export type ThreadPhase =
  | "waiting_for_approval"
  | "waiting_for_input"
  | "failed"
  | "starting"
  | "running"
  | "completed"
  | "idle";

/** How a run ended. A turn in this library is one V2 run. */
export interface TurnOutcome {
  readonly state: OrchestrationV2RunTerminalStatus;
  readonly runId: RunId;
  readonly run: OrchestrationV2Run;
  readonly assistantMessage?: OrchestrationV2ConversationMessage;
  readonly error?: string;
  readonly projection: OrchestrationV2ThreadProjection;
}

/** Requests the provider raised that nobody has answered, oldest first. */
export function pendingRequests(
  projection: Pick<OrchestrationV2ThreadProjection, "runtimeRequests" | "turnItems">,
): PendingRequest[] {
  const out: PendingRequest[] = [];
  const pending = projection.runtimeRequests
    .filter((request) => request.status === "pending")
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id));
  for (const request of pending) {
    const requestId = request.id;
    if (request.kind === "user_input") {
      const item = projection.turnItems.find(
        (candidate): candidate is OrchestrationV2TurnItemOfType<"user_input_request"> =>
          isTurnItemOfType(candidate, "user_input_request") && candidate.requestId === requestId,
      );
      out.push({ kind: "user-input", requestId, request, item, questions: item?.questions ?? [] });
      continue;
    }
    const item = projection.turnItems.find(
      (candidate): candidate is OrchestrationV2TurnItemOfType<"approval_request"> =>
        isTurnItemOfType(candidate, "approval_request") && candidate.requestId === requestId,
    );
    out.push({ kind: "approval", requestId, request, item });
  }
  return out;
}

/** The outcome of a settled run; `undefined` while the run is not terminal. */
export function runOutcome(
  projection: OrchestrationV2ThreadProjection,
  run: OrchestrationV2Run,
): TurnOutcome | undefined {
  if (!isRunTerminalStatus(run.status)) return undefined;
  const assistantMessage = assistantMessageForRun(projection, run.id);
  const error = runError(projection, run);
  return {
    state: run.status,
    runId: run.id,
    run,
    ...(assistantMessage === undefined ? {} : { assistantMessage }),
    ...(error === undefined ? {} : { error }),
    projection,
  };
}

/** The last assistant message of a run; a finished message is preferred over a streaming one. */
export function assistantMessageForRun(
  projection: Pick<OrchestrationV2ThreadProjection, "messages">,
  runId: RunId,
): OrchestrationV2ConversationMessage | undefined {
  const messages = projection.messages.filter((m) => m.role === "assistant" && m.runId === runId);
  return messages.findLast((m) => !m.streaming) ?? messages.at(-1);
}

/** The provider failure recorded for a run, or the thread's last error when the run failed. */
function runError(
  projection: OrchestrationV2ThreadProjection,
  run: OrchestrationV2Run,
): string | undefined {
  const item = projection.turnItems.findLast(
    (candidate) => isTurnItemOfType(candidate, "error") && candidate.runId === run.id,
  );
  if (item && isTurnItemOfType(item, "error")) return item.failure.message;
  if (run.status !== "failed") return undefined;
  return projection.thread.rollbackFailure?.message;
}

/** The newest run that holds the thread: preparing, queued, starting, running, or waiting. */
export function activeRun(
  projection: Pick<OrchestrationV2ThreadProjection, "runs">,
): OrchestrationV2Run | undefined {
  return projection.runs.findLast((run) => !isRunTerminalStatus(run.status));
}

/** Pure classification of a shell thread. */
export function threadPhase(shell: OrchestrationV2ThreadShell): ThreadPhase {
  const pending = shell.pendingRuntimeRequest;
  if (pending) return pending.kind === "user_input" ? "waiting_for_input" : "waiting_for_approval";
  switch (shell.status) {
    case "preparing":
    case "queued":
    case "starting":
      return "starting";
    case "running":
    case "waiting":
      return "running";
    case "completed":
    case "interrupted":
    case "cancelled":
    case "rolled_back":
      return "completed";
    case "failed":
      return "failed";
    default:
      return "idle";
  }
}
