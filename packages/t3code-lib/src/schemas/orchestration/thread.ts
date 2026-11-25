// ---
// relationships:
//   implements: library
// ---
/** The app-level thread record of `orchestrationV2.ts`: `OrchestrationV2AppThread` and its parts. */
import { ThreadIssueLink } from "../threadIssues.ts";
import { z } from "zod";
import {
  CommandId,
  GitRefName,
  IsoDateTime,
  NodeId,
  ProjectId,
  ProviderInstanceId,
  ProviderThreadId,
  ProviderTurnId,
  RunId,
  ThreadId,
  TrimmedNonEmptyString,
  forwardCompatibleLiteral,
  taggedUnionWithUnknown,
} from "../common.ts";
import {
  ModelSelection,
  OrchestrationV2CreationFields,
  OrchestrationV2ThreadHistoryOrigin,
  ProviderInteractionMode,
  RuntimeMode,
} from "./model.ts";
import { ThreadLinkedPullRequest, ThreadPullRequestLink } from "./pullRequest.ts";
import { ThreadGuestShare } from "./guestShare.ts";
import { StoredThreadTags } from "./threadTags.ts";
import {
  OrchestrationV2DelegatedFrom,
  OrchestrationV2LinkOrigin,
  OrchestrationV2WorkflowOrigin,
} from "./threadLink.ts";

export const OrchestrationV2AppThreadLineage = z.looseObject({
  parentThreadId: ThreadId.nullable(),
  relationshipToParent: forwardCompatibleLiteral(["fork", "subagent"]).nullable(),
  rootThreadId: ThreadId,
  /** A side chat lives inside its parent's view and stays out of thread lists. */
  sideChat: z.boolean().optional(),
  /** An agent step of a workflow run, which the thread's `workflowRun` names. */
  workflowStep: z.boolean().optional(),
});
export type OrchestrationV2AppThreadLineage = z.infer<typeof OrchestrationV2AppThreadLineage>;

/** How often and how recently the user opened a thread. `openedAt` is epoch milliseconds. */
export const OrchestrationV2ThreadOpens = z.looseObject({
  openedAt: z.number(),
  score: z.number().min(0),
  picks: z.array(z.looseObject({ query: z.string().max(32), at: z.number() })).max(3),
});
export type OrchestrationV2ThreadOpens = z.infer<typeof OrchestrationV2ThreadOpens>;
/** Opens that do not decode load as null, as upstream does, so that they never fail a thread. */
export const OrchestrationV2LenientThreadOpens = OrchestrationV2ThreadOpens.nullable().catch(null);

export const OrchestrationV2ThreadForkedFrom = taggedUnionWithUnknown("type", [
  z.looseObject({ type: z.literal("run"), threadId: ThreadId, runId: RunId }),
  z.looseObject({ type: z.literal("node"), nodeId: NodeId }),
  z.looseObject({
    type: z.literal("provider_thread"),
    providerThreadId: ProviderThreadId,
    providerTurnId: ProviderTurnId.optional(),
  }),
]);
export type OrchestrationV2ThreadForkedFrom = z.infer<typeof OrchestrationV2ThreadForkedFrom>;

export const OrchestrationV2LimitRecovery = z.looseObject({
  requestId: CommandId.optional(),
  runId: RunId,
  resetAt: IsoDateTime,
  autoResume: z.boolean(),
  snooze: z.boolean().optional(),
});
export type OrchestrationV2LimitRecovery = z.infer<typeof OrchestrationV2LimitRecovery>;

/** A choice update preserves omitted options for this same run and reset. */
export const OrchestrationV2LimitRecoveryUpdate = z
  .looseObject({
    runId: RunId,
    resetAt: IsoDateTime,
    autoResume: z.boolean().optional(),
    snooze: z.boolean().optional(),
  })
  .refine(
    (update) => update.autoResume !== undefined || update.snooze !== undefined,
    "A recovery update must include autoResume or snooze.",
  );
export type OrchestrationV2LimitRecoveryUpdate = z.infer<typeof OrchestrationV2LimitRecoveryUpdate>;

export const ThreadTitleRegeneration = z.looseObject({
  requestId: CommandId,
  startedAt: IsoDateTime,
});
export type ThreadTitleRegeneration = z.infer<typeof ThreadTitleRegeneration>;

/** How a title regeneration ended. `message` says why it failed or kept the title. */
export const ThreadTitleRegenerationOutcome = z.looseObject({
  status: forwardCompatibleLiteral(["renamed", "unchanged", "failed"]),
  message: z.string().optional(),
});
export type ThreadTitleRegenerationOutcome = z.infer<typeof ThreadTitleRegenerationOutcome>;

/** The latest title regeneration that finished. Absent from older servers. */
export const LastThreadTitleRegeneration = z.looseObject({
  ...ThreadTitleRegenerationOutcome.shape,
  requestId: CommandId,
  completedAt: IsoDateTime,
});
export type LastThreadTitleRegeneration = z.infer<typeof LastThreadTitleRegeneration>;

export const OrchestrationV2AppThread = z.looseObject({
  ...OrchestrationV2CreationFields,
  id: ThreadId,
  projectId: ProjectId,
  title: TrimmedNonEmptyString,
  providerInstanceId: ProviderInstanceId,
  modelSelection: ModelSelection,
  runtimeMode: RuntimeMode,
  interactionMode: ProviderInteractionMode,
  branch: GitRefName.nullable(),
  worktreePath: TrimmedNonEmptyString.nullable(),
  linkedPullRequest: ThreadLinkedPullRequest.nullable().optional(),
  pullRequests: z.array(ThreadPullRequestLink).optional(),
  branchPullRequest: ThreadLinkedPullRequest.nullable().optional(),
  issues: z.array(ThreadIssueLink).optional(),
  activeProviderThreadId: ProviderThreadId.nullable(),
  historyOrigin: OrchestrationV2ThreadHistoryOrigin.optional(),
  linkOrigin: OrchestrationV2LinkOrigin.optional(),
  delegatedFrom: OrchestrationV2DelegatedFrom.optional(),
  workflowRun: OrchestrationV2WorkflowOrigin.optional(),
  lineage: OrchestrationV2AppThreadLineage,
  forkedFrom: OrchestrationV2ThreadForkedFrom.nullable(),
  createdAt: IsoDateTime,
  updatedAt: IsoDateTime,
  archivedAt: IsoDateTime.nullable(),
  settledOverride: forwardCompatibleLiteral(["settled", "active"]).nullable().default(null),
  settledAt: IsoDateTime.nullable().default(null),
  unsettledAt: IsoDateTime.nullable().optional(),
  snoozedUntil: IsoDateTime.nullable().optional(),
  snoozedAt: IsoDateTime.nullable().optional(),
  lastSnoozeWakeAt: IsoDateTime.nullable().optional(),
  limitRecovery: OrchestrationV2LimitRecovery.nullable().optional(),
  guestShare: ThreadGuestShare.nullable().optional(),
  opens: OrchestrationV2LenientThreadOpens.optional(),
  pinnedAt: IsoDateTime.nullable().optional(),
  autoSettleDisabledAt: IsoDateTime.nullable().optional(),
  pinOrderKey: TrimmedNonEmptyString.nullable().optional(),
  activeOrderKey: TrimmedNonEmptyString.nullable().optional(),
  /** Absent on threads written before tags existed; read as empty. */
  tags: StoredThreadTags.optional(),
  lastVisitedAt: IsoDateTime.nullable().default(null),
  titleRegeneration: ThreadTitleRegeneration.nullable().optional(),
  lastTitleRegeneration: LastThreadTitleRegeneration.nullable().optional(),
  /** Set by a rename or a naming launch until a generated title replaces it; absent reads false. */
  titleRenamed: z.boolean().optional(),
  /** Latest accepted rollback. Only its failure is recorded in `rollbackFailure`. */
  rollbackRequestId: CommandId.optional(),
  rollbackFailure: z
    .looseObject({ requestId: CommandId, message: TrimmedNonEmptyString })
    .nullable()
    .optional(),
  /** Repositories a completed rewind left as they were: none had a snapshot to go back to. */
  rollbackUnrestored: z
    .looseObject({ requestId: CommandId, repositories: z.array(TrimmedNonEmptyString) })
    .nullable()
    .optional(),
  deletedAt: IsoDateTime.nullable(),
});
export type OrchestrationV2AppThread = z.infer<typeof OrchestrationV2AppThread>;

/** A visit changes read state only, so its event leaves the rest of the thread out. */
export const OrchestrationV2ThreadVisit = z.looseObject({
  lastVisitedAt: OrchestrationV2AppThread.shape.lastVisitedAt,
  opens: OrchestrationV2AppThread.shape.opens,
});
export type OrchestrationV2ThreadVisit = z.infer<typeof OrchestrationV2ThreadVisit>;

/**
 * Subagents and side chats live inside their parent's view, and a workflow run's agent steps
 * inside the run's, never in thread lists.
 */
export function isListedThreadLineage(lineage: OrchestrationV2AppThreadLineage): boolean {
  return (
    lineage.relationshipToParent !== "subagent" &&
    lineage.sideChat !== true &&
    lineage.workflowStep !== true
  );
}

/**
 * A subagent the provider spawned on its own. The provider owns its
 * conversation, so it cannot take messages; delegated-task children can.
 */
export function isProviderNativeSubagentThread(
  thread: Pick<OrchestrationV2AppThread, "lineage" | "creationSource">,
): boolean {
  return thread.lineage.relationshipToParent === "subagent" && thread.creationSource === "provider";
}

/** A thread another agent drives: a local subagent or a task delegated from a linked environment. */
export function isDelegatedAppThread(
  thread: Pick<OrchestrationV2AppThread, "lineage" | "delegatedFrom">,
): boolean {
  // MCP-launched threads store `delegatedFrom: null`, so both absent shapes count.
  return thread.lineage.relationshipToParent === "subagent" || thread.delegatedFrom != null;
}
