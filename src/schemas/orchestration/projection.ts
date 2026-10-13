// ---
// relationships:
//   implements: design
// ---
/** One thread's full state as the server projects it, and the snapshot shapes that carry it. */
import { z } from "zod";
import {
  IsoDateTime,
  NonNegativeInt,
  TrimmedNonEmptyString,
  knownMembersArray,
} from "../common.ts";
import { OrchestrationV2ContextHandoff, OrchestrationV2ContextTransfer } from "./context.ts";
import { OrchestrationV2ConversationMessage, OrchestrationV2PlanArtifact } from "./messages.ts";
import {
  OrchestrationV2ProviderSession,
  OrchestrationV2ProviderThread,
  OrchestrationV2ProviderTurn,
  OrchestrationV2RuntimeRequest,
} from "./providerState.ts";
import {
  OrchestrationV2Checkpoint,
  OrchestrationV2CheckpointScope,
  OrchestrationV2ExecutionNode,
  OrchestrationV2Run,
  OrchestrationV2RunAttempt,
  OrchestrationV2Subagent,
} from "./runs.ts";
import { OrchestrationV2AppThread } from "./thread.ts";
import { OrchestrationV2ProjectedTurnItems, OrchestrationV2TurnItems } from "./turnItems.ts";

export const OrchestrationV2ThreadProjection = z.looseObject({
  thread: OrchestrationV2AppThread,
  runs: z.array(OrchestrationV2Run),
  attempts: z.array(OrchestrationV2RunAttempt),
  nodes: z.array(OrchestrationV2ExecutionNode),
  subagents: z.array(OrchestrationV2Subagent),
  providerSessions: z.array(OrchestrationV2ProviderSession),
  providerThreads: z.array(OrchestrationV2ProviderThread),
  providerTurns: z.array(OrchestrationV2ProviderTurn),
  runtimeRequests: z.array(OrchestrationV2RuntimeRequest),
  messages: z.array(OrchestrationV2ConversationMessage),
  plans: knownMembersArray(OrchestrationV2PlanArtifact),
  turnItems: OrchestrationV2TurnItems,
  checkpointScopes: z.array(OrchestrationV2CheckpointScope),
  checkpoints: z.array(OrchestrationV2Checkpoint),
  contextHandoffs: z.array(OrchestrationV2ContextHandoff),
  contextTransfers: z.array(OrchestrationV2ContextTransfer),
  /** The timeline as the server last ordered it; events update `turnItems`, not this. */
  visibleTurnItems: OrchestrationV2ProjectedTurnItems,
  updatedAt: IsoDateTime,
});
export type OrchestrationV2ThreadProjection = z.infer<typeof OrchestrationV2ThreadProjection>;

/** Progressive-history fields: present on bounded snapshots, absent on full ones. */
const historyWindowFields = {
  historyCursor: TrimmedNonEmptyString.nullable().optional(),
  hasMoreHistory: z.boolean().optional(),
  latestLocalTurnOrdinal: NonNegativeInt.nullable().optional(),
  payloadBudgetExceeded: z.boolean().optional(),
  /** `projection.turnItems` omits the local visible rows' items; see `boundedSnapshotProjection`. */
  turnItemsOmitLocalVisible: z.literal(true).optional(),
} as const;

export const OrchestrationV2ThreadDetailSnapshot = z.looseObject({
  snapshotSequence: NonNegativeInt,
  projection: OrchestrationV2ThreadProjection,
  ...historyWindowFields,
});
export type OrchestrationV2ThreadDetailSnapshot = z.infer<
  typeof OrchestrationV2ThreadDetailSnapshot
>;

/** A bounded cold open: full control-plane arrays with a recent window of timeline rows. */
export const OrchestrationV2ThreadBoundedSnapshot = z.looseObject({
  snapshotSequence: NonNegativeInt,
  projection: OrchestrationV2ThreadProjection,
  historyCursor: TrimmedNonEmptyString.nullable(),
  hasMoreHistory: z.boolean(),
  latestLocalTurnOrdinal: NonNegativeInt.nullable(),
  payloadBudgetExceeded: z.boolean().optional(),
  turnItemsOmitLocalVisible: z.literal(true).optional(),
});
export type OrchestrationV2ThreadBoundedSnapshot = z.infer<
  typeof OrchestrationV2ThreadBoundedSnapshot
>;

/** An older timeline page for progressive history. Rows are chronological. */
export const OrchestrationV2ThreadHistoryPage = z.looseObject({
  snapshotSequence: NonNegativeInt,
  items: OrchestrationV2ProjectedTurnItems,
  nextCursor: TrimmedNonEmptyString.nullable(),
  hasMoreHistory: z.boolean(),
});
export type OrchestrationV2ThreadHistoryPage = z.infer<typeof OrchestrationV2ThreadHistoryPage>;
