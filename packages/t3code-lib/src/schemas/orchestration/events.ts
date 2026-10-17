// ---
// relationships:
//   implements: library
// ---
/**
 * `OrchestrationV2DomainEvent`: every event a thread subscription delivers.
 * Each carries the full record it changed, so applying one is an upsert. An
 * event of a type this build does not know decodes as `{ unknown: true, raw }`.
 */
import { z } from "zod";
import {
  EventId,
  IsoDateTime,
  NodeId,
  ProviderDriverKind,
  ProviderInstanceId,
  RawEventId,
  RunId,
  ThreadId,
  taggedUnionWithUnknown,
  type UnknownVariant,
} from "../common.ts";
import { OrchestrationV2ContextHandoff, OrchestrationV2ContextTransfer } from "./context.ts";
import { OrchestrationV2ConversationMessage, OrchestrationV2PlanArtifact } from "./messages.ts";
import { ThreadPullRequestLink } from "./pullRequest.ts";
import {
  OrchestrationV2ProviderSession,
  OrchestrationV2ProviderSessionDetached,
  OrchestrationV2ProviderThread,
  OrchestrationV2ProviderTurn,
  OrchestrationV2RuntimeRequest,
} from "./providerState.ts";
import {
  OrchestrationV2Checkpoint,
  OrchestrationV2CheckpointRollbackRequest,
  OrchestrationV2CheckpointScope,
  OrchestrationV2ExecutionNode,
  OrchestrationV2Run,
  OrchestrationV2RunAttempt,
  OrchestrationV2RunBackgroundWorkCancelled,
  OrchestrationV2Subagent,
} from "./runs.ts";
import { OrchestrationV2AppThread } from "./thread.ts";
import { OrchestrationV2TurnItem } from "./turnItems.ts";

const eventBase = {
  id: EventId,
  threadId: ThreadId,
  runId: RunId.optional(),
  nodeId: NodeId.optional(),
  driver: ProviderDriverKind.optional(),
  providerInstanceId: ProviderInstanceId.optional(),
  rawEventId: RawEventId.optional(),
  occurredAt: IsoDateTime,
} as const;

/** Thread events whose payload is the whole thread record. */
export const THREAD_STATE_EVENT_TYPES = [
  "thread.archived",
  "thread.unarchived",
  "thread.deleted",
  "thread.settled",
  "thread.unsettled",
  "thread.snoozed",
  "thread.unsnoozed",
  "thread.pinned",
  "thread.auto-settle-set",
  "thread.unpinned",
  "thread.pin-reordered",
  "thread.active-reordered",
  "thread.visited",
  "thread.marked-unread",
  "thread.metadata-updated",
  "thread.pull-request-synced",
  "thread.runtime-mode-updated",
  "thread.interaction-mode-updated",
  "thread.model-selection-updated",
  "thread.provider-switched",
] as const;

const event = <T extends string, P extends z.ZodType>(type: T, payload: P) =>
  z.looseObject({ ...eventBase, type: z.literal(type), payload });

export const OrchestrationV2DomainEvent = taggedUnionWithUnknown("type", [
  event("thread.created", OrchestrationV2AppThread),
  z.looseObject({
    ...eventBase,
    type: z.enum(THREAD_STATE_EVENT_TYPES),
    payload: OrchestrationV2AppThread,
  }),
  /** One linked pull request changed; the payload replaces the thread's link with the same key. */
  event("thread.pull-request-link-updated", ThreadPullRequestLink),
  event("run.created", OrchestrationV2Run),
  event("run.updated", OrchestrationV2Run),
  event("run.background-work-cancelled", OrchestrationV2RunBackgroundWorkCancelled),
  event("run-attempt.created", OrchestrationV2RunAttempt),
  event("run-attempt.updated", OrchestrationV2RunAttempt),
  event("node.updated", OrchestrationV2ExecutionNode),
  event("subagent.updated", OrchestrationV2Subagent),
  z.looseObject({
    ...eventBase,
    type: z.enum(["provider-session.attached", "provider-session.updated"]),
    payload: OrchestrationV2ProviderSession,
  }),
  event("provider-session.detached", OrchestrationV2ProviderSessionDetached),
  event("provider-thread.updated", OrchestrationV2ProviderThread),
  event("provider-turn.updated", OrchestrationV2ProviderTurn),
  event("runtime-request.updated", OrchestrationV2RuntimeRequest),
  event("message.updated", OrchestrationV2ConversationMessage),
  /** The payload itself may be a turn item of an unknown type; check `unknown` on it. */
  event("turn-item.updated", OrchestrationV2TurnItem),
  event("plan.updated", OrchestrationV2PlanArtifact),
  event("checkpoint-scope.created", OrchestrationV2CheckpointScope),
  event("checkpoint.captured", OrchestrationV2Checkpoint),
  event("checkpoint.rollback-requested", OrchestrationV2CheckpointRollbackRequest),
  event("context-handoff.updated", OrchestrationV2ContextHandoff),
  event("context-transfer.created", OrchestrationV2ContextTransfer),
  event("context-transfer.updated", OrchestrationV2ContextTransfer),
]);
export type OrchestrationV2DomainEvent = z.infer<typeof OrchestrationV2DomainEvent>;
export type KnownOrchestrationV2DomainEvent = Exclude<
  OrchestrationV2DomainEvent,
  UnknownVariant<"type">
>;
export type OrchestrationV2DomainEventType = KnownOrchestrationV2DomainEvent["type"];
