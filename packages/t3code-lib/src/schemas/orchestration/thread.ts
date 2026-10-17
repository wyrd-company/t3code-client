// ---
// relationships:
//   implements: library
// ---
/** The app-level thread record of `orchestrationV2.ts`: `OrchestrationV2AppThread` and its parts. */
import { z } from "zod";
import {
  CommandId,
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

export const OrchestrationV2AppThreadLineage = z.looseObject({
  parentThreadId: ThreadId.nullable(),
  relationshipToParent: forwardCompatibleLiteral(["fork", "subagent"]).nullable(),
  rootThreadId: ThreadId,
});
export type OrchestrationV2AppThreadLineage = z.infer<typeof OrchestrationV2AppThreadLineage>;

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

export const OrchestrationV2AppThread = z.looseObject({
  ...OrchestrationV2CreationFields,
  id: ThreadId,
  projectId: ProjectId,
  title: TrimmedNonEmptyString,
  providerInstanceId: ProviderInstanceId,
  modelSelection: ModelSelection,
  runtimeMode: RuntimeMode,
  interactionMode: ProviderInteractionMode,
  branch: TrimmedNonEmptyString.nullable(),
  worktreePath: TrimmedNonEmptyString.nullable(),
  linkedPullRequest: ThreadLinkedPullRequest.nullable().optional(),
  pullRequests: z.array(ThreadPullRequestLink).optional(),
  branchPullRequest: ThreadLinkedPullRequest.nullable().optional(),
  activeProviderThreadId: ProviderThreadId.nullable(),
  historyOrigin: OrchestrationV2ThreadHistoryOrigin.optional(),
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
  limitRecovery: OrchestrationV2LimitRecovery.nullable().optional(),
  pinnedAt: IsoDateTime.nullable().optional(),
  autoSettleDisabledAt: IsoDateTime.nullable().optional(),
  pinOrderKey: TrimmedNonEmptyString.nullable().optional(),
  activeOrderKey: TrimmedNonEmptyString.nullable().optional(),
  lastVisitedAt: IsoDateTime.nullable().default(null),
  titleRegeneration: ThreadTitleRegeneration.nullable().optional(),
  /** Latest accepted rollback. Only its failure is recorded in `rollbackFailure`. */
  rollbackRequestId: CommandId.optional(),
  rollbackFailure: z
    .looseObject({ requestId: CommandId, message: TrimmedNonEmptyString })
    .nullable()
    .optional(),
  deletedAt: IsoDateTime.nullable(),
});
export type OrchestrationV2AppThread = z.infer<typeof OrchestrationV2AppThread>;

/**
 * A subagent the provider spawned on its own. The provider owns its
 * conversation, so it cannot take messages; delegated-task children can.
 */
export function isProviderNativeSubagentThread(
  thread: Pick<OrchestrationV2AppThread, "lineage" | "creationSource">,
): boolean {
  return thread.lineage.relationshipToParent === "subagent" && thread.creationSource === "provider";
}
