// ---
// relationships:
//   implements: library
// ---
/** Reads that serve the thread rows a shell can leave out of its snapshots. */
import { z } from "zod";
import {
  IsoDateTime,
  NonNegativeInt,
  ProjectId,
  ThreadId,
  TrimmedNonEmptyString,
} from "../common.ts";
import { OrchestrationV2OlderSettledCount, OrchestrationV2ThreadShell } from "./shell.ts";

export const OrchestrationV2GetThreadFamilyInput = z.looseObject({
  threadId: ThreadId,
});
export type OrchestrationV2GetThreadFamilyInput = z.infer<
  typeof OrchestrationV2GetThreadFamilyInput
>;

/**
 * The active threads that share the requested thread's `lineage.rootThreadId`, in any run state.
 * An unknown thread has an empty family; a deleted one still names its root.
 */
export const OrchestrationV2ThreadFamily = z.looseObject({
  snapshotSequence: NonNegativeInt,
  threads: z.array(OrchestrationV2ThreadShell),
});
export type OrchestrationV2ThreadFamily = z.infer<typeof OrchestrationV2ThreadFamily>;

export const OrchestrationV2GetWorktreeThreadIdsInput = z.looseObject({
  worktreePath: TrimmedNonEmptyString,
});
export type OrchestrationV2GetWorktreeThreadIdsInput = z.infer<
  typeof OrchestrationV2GetWorktreeThreadIdsInput
>;

/** Active threads on a worktree path, including subagent children a shell can leave out. */
export const OrchestrationV2WorktreeThreadIds = z.looseObject({
  threadIds: z.array(ThreadId),
});
export type OrchestrationV2WorktreeThreadIds = z.infer<typeof OrchestrationV2WorktreeThreadIds>;

/** Where a page of older settled threads starts: below this settle time, then after this id. */
export const OrchestrationV2OlderSettledCursor = z.looseObject({
  settledAt: IsoDateTime,
  threadId: ThreadId.optional(),
});
export type OrchestrationV2OlderSettledCursor = z.infer<typeof OrchestrationV2OlderSettledCursor>;

export const OrchestrationV2GetOlderSettledThreadsInput = z.looseObject({
  before: OrchestrationV2OlderSettledCursor,
  /** Every project when absent. */
  projectIds: z.array(ProjectId).optional(),
  /** 0 reads only the counts. */
  limit: z.number().int().min(0).max(50),
});
export type OrchestrationV2GetOlderSettledThreadsInput = z.infer<
  typeof OrchestrationV2GetOlderSettledThreadsInput
>;

/**
 * Older settled threads below the cursor, newest settle first. A `limit: 0` read fills `counts`
 * instead, per project. A cursor without an id is strict.
 */
export const OrchestrationV2OlderSettledThreadsPage = z.looseObject({
  snapshotSequence: NonNegativeInt,
  threads: z.array(OrchestrationV2ThreadShell),
  counts: z.array(OrchestrationV2OlderSettledCount),
});
export type OrchestrationV2OlderSettledThreadsPage = z.infer<
  typeof OrchestrationV2OlderSettledThreadsPage
>;
