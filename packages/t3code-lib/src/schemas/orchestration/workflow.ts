// ---
// relationships:
//   implements: library
// ---
/** Workflow runs a coordinator subagent reports, from `orchestrationV2.ts`. */
import { z } from "zod";
import {
  NonNegativeInt,
  ThreadId,
  TrimmedNonEmptyString,
  forwardCompatibleLiteral,
} from "../common.ts";

/** One entry of a workflow's phase plan; the list only grows while the run executes. */
export const OrchestrationV2WorkflowPhase = z.looseObject({
  index: NonNegativeInt,
  title: TrimmedNonEmptyString,
});
export type OrchestrationV2WorkflowPhase = z.infer<typeof OrchestrationV2WorkflowPhase>;

/** One agent inside a workflow run. Timestamps are epoch milliseconds. */
export const OrchestrationV2WorkflowAgent = z.looseObject({
  /** Spawn ordinal within the run; an agent keeps it across updates. */
  index: NonNegativeInt,
  label: TrimmedNonEmptyString,
  agentId: TrimmedNonEmptyString.optional(),
  childThreadId: ThreadId.optional(),
  state: forwardCompatibleLiteral(["queued", "running", "completed", "failed"]),
  phaseIndex: NonNegativeInt.optional(),
  phaseTitle: TrimmedNonEmptyString.optional(),
  model: TrimmedNonEmptyString.optional(),
  /** Retry counter; above 1 means the agent restarted after a provider error. */
  attempt: NonNegativeInt.optional(),
  totalTokens: NonNegativeInt.optional(),
  toolCalls: NonNegativeInt.optional(),
  durationMs: NonNegativeInt.optional(),
  queuedAt: NonNegativeInt.optional(),
  startedAt: NonNegativeInt.optional(),
  /** Capped excerpts of the agent's prompt and answer. */
  prompt: z.string().min(1).optional(),
  result: z.string().min(1).optional(),
});
export type OrchestrationV2WorkflowAgent = z.infer<typeof OrchestrationV2WorkflowAgent>;

export const OrchestrationV2WorkflowRunHandles = z.looseObject({
  runId: TrimmedNonEmptyString.optional(),
  transcriptDir: TrimmedNonEmptyString.optional(),
  scriptPath: TrimmedNonEmptyString.optional(),
});
export type OrchestrationV2WorkflowRunHandles = z.infer<typeof OrchestrationV2WorkflowRunHandles>;

/** The provider's replace-in-full view of a workflow run, carried by its coordinator subagent. */
export const OrchestrationV2SubagentWorkflow = z.looseObject({
  name: TrimmedNonEmptyString.optional(),
  runHandles: OrchestrationV2WorkflowRunHandles.optional(),
  phases: z.array(OrchestrationV2WorkflowPhase),
  agents: z.array(OrchestrationV2WorkflowAgent),
  totalTokens: NonNegativeInt.optional(),
  toolCalls: NonNegativeInt.optional(),
  durationMs: NonNegativeInt.optional(),
});
export type OrchestrationV2SubagentWorkflow = z.infer<typeof OrchestrationV2SubagentWorkflow>;
