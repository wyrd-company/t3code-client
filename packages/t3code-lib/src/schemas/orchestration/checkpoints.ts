// ---
// relationships:
//   implements: library
// ---
/** Checkpoint scopes, checkpoints, and rollback requests of `orchestrationV2.ts`. */
import { z } from "zod";
import {
  CheckpointId,
  CheckpointRef,
  CheckpointScopeId,
  IsoDateTime,
  NodeId,
  NonNegativeInt,
  PositiveInt,
  ProviderThreadId,
  RunId,
  ThreadId,
  TrimmedNonEmptyString,
  forwardCompatibleLiteral,
} from "../common.ts";

export const OrchestrationV2CheckpointScope = z.looseObject({
  id: CheckpointScopeId,
  threadId: ThreadId,
  runId: RunId.nullable(),
  nodeId: NodeId,
  parentScopeId: CheckpointScopeId.nullable(),
  providerThreadId: ProviderThreadId.nullable(),
  kind: forwardCompatibleLiteral(["root_run", "subagent", "tool", "provider_thread", "manual"]),
  ordinalWithinParent: NonNegativeInt,
  advancesAppRunCount: z.boolean(),
  cwd: TrimmedNonEmptyString,
  /** Repository scopes: the folder's display name. */
  label: TrimmedNonEmptyString.optional(),
  /**
   * Set on a repository scope: one tracked Git folder the thread reaches, a child of the root
   * scope, holding the tracked path (it stays the same when `cwd` moves). Such a scope uses kind
   * `manual`.
   */
  repositoryPath: TrimmedNonEmptyString.optional(),
  createdAt: IsoDateTime,
});
export type OrchestrationV2CheckpointScope = z.infer<typeof OrchestrationV2CheckpointScope>;

export const OrchestrationV2CheckpointFileSummary = z.looseObject({
  /** Exact, as git reports it: a file name may start or end with whitespace. */
  path: z.string().min(1),
  kind: TrimmedNonEmptyString,
  additions: NonNegativeInt,
  deletions: NonNegativeInt,
});
export type OrchestrationV2CheckpointFileSummary = z.infer<
  typeof OrchestrationV2CheckpointFileSummary
>;

/** Sent only when the wire carries a prefix of `files`; the totals cover the full list. */
export const OrchestrationV2CheckpointFileTotals = z.looseObject({
  count: NonNegativeInt,
  additions: NonNegativeInt,
  deletions: NonNegativeInt,
});
export type OrchestrationV2CheckpointFileTotals = z.infer<
  typeof OrchestrationV2CheckpointFileTotals
>;

export const OrchestrationV2Checkpoint = z.looseObject({
  id: CheckpointId,
  threadId: ThreadId,
  scopeId: CheckpointScopeId,
  runId: RunId.nullable(),
  nodeId: NodeId,
  parentCheckpointId: CheckpointId.nullable(),
  ordinalWithinScope: NonNegativeInt,
  appRunOrdinal: PositiveInt.nullable(),
  ref: CheckpointRef,
  status: forwardCompatibleLiteral(["ready", "missing", "error", "stale"]),
  files: z.array(OrchestrationV2CheckpointFileSummary),
  filesTotal: OrchestrationV2CheckpointFileTotals.optional(),
  capturedAt: IsoDateTime,
});
export type OrchestrationV2Checkpoint = z.infer<typeof OrchestrationV2Checkpoint>;

export const OrchestrationV2CheckpointRollbackRequest = z.looseObject({
  scopeId: CheckpointScopeId,
  checkpointId: CheckpointId,
  requestedAt: IsoDateTime,
});
export type OrchestrationV2CheckpointRollbackRequest = z.infer<
  typeof OrchestrationV2CheckpointRollbackRequest
>;
