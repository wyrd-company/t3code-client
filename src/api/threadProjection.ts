// ---
// relationships:
//   implements: design
// ---
/**
 * Pure event-application rules for one thread projection. Every V2 domain
 * event carries the whole record it changed, so applying one is an upsert
 * into the matching projection array; the server's own projection and the
 * T3 web client fold events the same way. Unknown events leave the
 * projection as is. No I/O.
 */
import { isUnknownVariant } from "../schemas/common.ts";
import {
  THREAD_STATE_EVENT_TYPES,
  type KnownOrchestrationV2DomainEvent,
  type OrchestrationV2DomainEvent,
} from "../schemas/orchestration/events.ts";
import type { OrchestrationV2ThreadProjection } from "../schemas/orchestration/projection.ts";
import type { ThreadPullRequestLink } from "../schemas/orchestration/pullRequest.ts";

export {
  assistantMessageForRun,
  pendingRequests,
  runOutcome,
  threadPhase,
  type PendingRequest,
  type ThreadPhase,
  type TurnOutcome,
} from "./threadDerived.ts";

/** Narrows a growing tagged union to its recognised members. */
export function isKnownVariant<T extends object>(value: T): value is Exclude<T, { unknown: true }> {
  return (value as { unknown?: unknown }).unknown !== true;
}

const threadStateTypes: ReadonlySet<string> = new Set(THREAD_STATE_EVENT_TYPES);

type Projection = OrchestrationV2ThreadProjection;
type ThreadRecordEvent = Extract<
  KnownOrchestrationV2DomainEvent,
  { type: "thread.created" | (typeof THREAD_STATE_EVENT_TYPES)[number] }
>;

/** Events whose payload is the whole thread record. */
function isThreadRecordEvent(event: KnownOrchestrationV2DomainEvent): event is ThreadRecordEvent {
  return event.type === "thread.created" || threadStateTypes.has(event.type);
}

/** Upsert by `id`, keeping the position of an existing entry. */
export function upsertById<T extends { readonly id: string }>(
  entries: readonly T[],
  entry: T,
): T[] {
  const index = entries.findIndex((candidate) => candidate.id === entry.id);
  if (index === -1) return [...entries, entry];
  return entries.map((candidate, i) => (i === index ? entry : candidate));
}

/** Applies one event to the projection. Events for other threads and unknown events leave it unchanged. */
export function applyThreadEvent(
  projection: Projection,
  event: OrchestrationV2DomainEvent,
): Projection {
  if (!isKnownVariant(event)) return projection;
  if (event.threadId !== projection.thread.id) return projection;
  const next = applyKnownEvent(projection, event);
  return next === projection ? projection : { ...next, updatedAt: event.occurredAt };
}

function applyKnownEvent(p: Projection, event: KnownOrchestrationV2DomainEvent): Projection {
  if (isThreadRecordEvent(event)) return { ...p, thread: event.payload };
  switch (event.type) {
    case "thread.pull-request-link-updated":
      return { ...p, thread: { ...p.thread, pullRequests: replaceLink(p.thread, event.payload) } };
    case "run.created":
    case "run.updated":
      return { ...p, runs: upsertById(p.runs, event.payload) };
    case "run.background-work-cancelled": {
      const { runId, restartCancelledBackgroundWork } = event.payload;
      if (!p.runs.some((run) => run.id === runId)) return p;
      return {
        ...p,
        runs: p.runs.map((run) =>
          run.id === runId ? { ...run, restartCancelledBackgroundWork } : run,
        ),
      };
    }
    case "run-attempt.created":
    case "run-attempt.updated":
      return { ...p, attempts: upsertById(p.attempts, event.payload) };
    case "node.updated":
      return { ...p, nodes: upsertById(p.nodes, event.payload) };
    case "subagent.updated":
      return { ...p, subagents: upsertById(p.subagents, event.payload) };
    case "provider-session.attached":
    case "provider-session.updated":
      return { ...p, providerSessions: upsertById(p.providerSessions, event.payload) };
    case "provider-session.detached":
      return {
        ...p,
        providerSessions: p.providerSessions.filter(
          (session) => session.id !== event.payload.providerSessionId,
        ),
      };
    case "provider-thread.updated":
      return { ...p, providerThreads: upsertById(p.providerThreads, event.payload) };
    case "provider-turn.updated":
      return { ...p, providerTurns: upsertById(p.providerTurns, event.payload) };
    case "runtime-request.updated":
      return { ...p, runtimeRequests: upsertById(p.runtimeRequests, event.payload) };
    case "message.updated":
      return { ...p, messages: upsertById(p.messages, event.payload) };
    case "turn-item.updated":
      // A turn item of a type this build does not know changes nothing it can show.
      if (isUnknownVariant<"type">(event.payload)) return p;
      return { ...p, turnItems: upsertById(p.turnItems, event.payload) };
    case "plan.updated":
      if (isUnknownVariant<"kind">(event.payload)) return p;
      return { ...p, plans: upsertById(p.plans, event.payload) };
    case "checkpoint-scope.created":
      return { ...p, checkpointScopes: upsertById(p.checkpointScopes, event.payload) };
    case "checkpoint.captured":
      return { ...p, checkpoints: upsertById(p.checkpoints, event.payload) };
    case "checkpoint.rollback-requested":
      // The thread record carries the rollback request id; the rollback itself arrives as updates.
      return p;
    case "context-handoff.updated":
      return { ...p, contextHandoffs: upsertById(p.contextHandoffs, event.payload) };
    case "context-transfer.created":
    case "context-transfer.updated":
      return { ...p, contextTransfers: upsertById(p.contextTransfers, event.payload) };
    default:
      return unreachableEvent(event, p);
  }
}

/** The thread's links with the one sharing `updated`'s key replaced; other links stay as they are. */
function replaceLink(
  thread: Projection["thread"],
  updated: ThreadPullRequestLink,
): ThreadPullRequestLink[] {
  const key = pullRequestKey(updated);
  return (thread.pullRequests ?? []).map((link) => (pullRequestKey(link) === key ? updated : link));
}

/** Host and repository compare case-insensitively, as upstream keys them. */
function pullRequestKey(link: ThreadPullRequestLink): string {
  return `${link.host.trim().toLowerCase()}/${link.repository.trim().toLowerCase()}#${link.number}`;
}

/** Compile-time check that every known event type has a branch above. */
function unreachableEvent(event: never, projection: Projection): Projection {
  void event;
  return projection;
}
