// ---
// relationships:
//   implements: design
// ---
/** Inputs and outputs of the `orchestration.*` RPC methods, and the thread stream items. */
import { z } from "zod";
import {
  CommandId,
  IsoDateTime,
  MessageId,
  NodeId,
  NonNegativeInt,
  ProjectId,
  ThreadId,
  TrimmedNonEmptyString,
  TrimmedString,
  TurnItemId,
  forwardCompatibleLiteral,
  taggedUnionWithUnknown,
} from "../common.ts";
import { ChatAttachment } from "./attachments.ts";
import { OrchestrationV2DomainEvent } from "./events.ts";
import { OrchestrationMessageContext } from "./messageContext.ts";
import {
  ModelSelection,
  OrchestrationV2CreationSource,
  ProviderInteractionMode,
  RuntimeMode,
} from "./model.ts";
import { OrchestrationV2ThreadProjection } from "./projection.ts";
import { OrchestrationV2ThreadLaunchWorkspaceStrategy } from "./runs.ts";
import { OrchestrationV2TurnItem } from "./turnItems.ts";

export const OrchestrationV2SubscribeThreadInput = z.looseObject({
  threadId: ThreadId,
  /** Skip the initial snapshot and replay events after this sequence. */
  afterSequence: NonNegativeInt.optional(),
  /** Requests a `synchronized` marker between catch-up and live delivery. */
  requestCompletionMarker: z.boolean().optional(),
  /** Allows the snapshot to be a bounded, pageable history window. */
  acceptBoundedSnapshot: z.boolean().optional(),
  /** Allows a bounded snapshot to omit turn items that repeat local visible rows. */
  acceptCompactTurnItems: z.boolean().optional(),
});
export type OrchestrationV2SubscribeThreadInput = z.infer<
  typeof OrchestrationV2SubscribeThreadInput
>;

export const OrchestrationV2ThreadStreamItem = taggedUnionWithUnknown("kind", [
  z.looseObject({ kind: z.literal("synchronized") }),
  z.looseObject({
    kind: z.literal("snapshot"),
    snapshotSequence: NonNegativeInt,
    projection: OrchestrationV2ThreadProjection,
    historyCursor: TrimmedNonEmptyString.nullable().optional(),
    hasMoreHistory: z.boolean().optional(),
    latestLocalTurnOrdinal: NonNegativeInt.nullable().optional(),
    payloadBudgetExceeded: z.boolean().optional(),
    turnItemsOmitLocalVisible: z.literal(true).optional(),
  }),
  z.looseObject({
    kind: z.literal("event"),
    sequence: NonNegativeInt,
    event: OrchestrationV2DomainEvent,
  }),
]);
export type OrchestrationV2ThreadStreamItem = z.infer<typeof OrchestrationV2ThreadStreamItem>;

export const OrchestrationV2DispatchCommandResult = z.looseObject({ sequence: NonNegativeInt });
export type OrchestrationV2DispatchCommandResult = z.infer<
  typeof OrchestrationV2DispatchCommandResult
>;
export const DispatchResult = OrchestrationV2DispatchCommandResult;
export type DispatchResult = OrchestrationV2DispatchCommandResult;

export const OrchestrationV2GetThreadProjectionInput = z.looseObject({ threadId: ThreadId });
export type OrchestrationV2GetThreadProjectionInput = z.infer<
  typeof OrchestrationV2GetThreadProjectionInput
>;

export const OrchestrationV2GetTurnItemInput = z.looseObject({
  threadId: ThreadId,
  itemId: TurnItemId,
  /** The item `updatedAt` the client last saw; only keys the client cache. */
  revision: z.string().optional(),
});
export type OrchestrationV2GetTurnItemInput = z.infer<typeof OrchestrationV2GetTurnItemInput>;
/** One persisted turn item with its full, size-bounded input and output. */
export const OrchestrationV2GetTurnItemResult = z.looseObject({
  item: OrchestrationV2TurnItem.nullable(),
});
export type OrchestrationV2GetTurnItemResult = z.infer<typeof OrchestrationV2GetTurnItemResult>;

export const OrchestrationV2ThreadLaunchInput = z.looseObject({
  commandId: CommandId,
  creationSource: OrchestrationV2CreationSource.optional(),
  threadId: ThreadId.optional(),
  reuseExistingThread: z.boolean().optional(),
  projectId: ProjectId,
  title: TrimmedNonEmptyString,
  generateTitle: z.boolean().optional(),
  modelSelection: ModelSelection,
  runtimeMode: RuntimeMode,
  interactionMode: ProviderInteractionMode,
  workspaceStrategy: OrchestrationV2ThreadLaunchWorkspaceStrategy,
  initialMessage: z
    .looseObject({
      messageId: MessageId.optional(),
      text: z.string(),
      context: OrchestrationMessageContext.optional(),
      attachments: z.array(ChatAttachment),
    })
    .optional(),
});
export type OrchestrationV2ThreadLaunchInput = z.infer<typeof OrchestrationV2ThreadLaunchInput>;
export const OrchestrationV2ThreadLaunchResult = z.looseObject({
  threadId: ThreadId,
  projection: OrchestrationV2ThreadProjection,
  resumed: z.boolean(),
});
export type OrchestrationV2ThreadLaunchResult = z.infer<typeof OrchestrationV2ThreadLaunchResult>;

export const TurnCountRange = z
  .looseObject({ fromTurnCount: NonNegativeInt, toTurnCount: NonNegativeInt })
  .refine(
    (v) => v.fromTurnCount <= v.toTurnCount,
    "fromTurnCount must be less than or equal to toTurnCount",
  );
export type TurnCountRange = z.infer<typeof TurnCountRange>;
export const OrchestrationGetTurnDiffInput = TurnCountRange.safeExtend({
  threadId: ThreadId,
  ignoreWhitespace: z.boolean().optional(),
});
export type OrchestrationGetTurnDiffInput = z.infer<typeof OrchestrationGetTurnDiffInput>;
export const ThreadTurnDiff = TurnCountRange.safeExtend({ threadId: ThreadId, diff: z.string() });
export type ThreadTurnDiff = z.infer<typeof ThreadTurnDiff>;
export const OrchestrationGetTurnDiffResult = ThreadTurnDiff;
export type OrchestrationGetTurnDiffResult = z.infer<typeof OrchestrationGetTurnDiffResult>;
export const OrchestrationGetFullThreadDiffInput = z.looseObject({
  threadId: ThreadId,
  toTurnCount: NonNegativeInt,
  ignoreWhitespace: z.boolean().optional(),
});
export type OrchestrationGetFullThreadDiffInput = z.infer<
  typeof OrchestrationGetFullThreadDiffInput
>;
export const OrchestrationGetFullThreadDiffResult = ThreadTurnDiff;
export type OrchestrationGetFullThreadDiffResult = z.infer<
  typeof OrchestrationGetFullThreadDiffResult
>;

export const OrchestrationSearchThreadsInput = z.looseObject({
  query: TrimmedString.min(2).max(200),
  limit: z.number().int().min(1).max(50).optional(),
});
export type OrchestrationSearchThreadsInput = z.infer<typeof OrchestrationSearchThreadsInput>;
export const OrchestrationThreadSearchSource = forwardCompatibleLiteral(["user", "assistant"]);
export const OrchestrationThreadSearchMatch = z.looseObject({
  threadId: ThreadId,
  projectId: ProjectId,
  source: OrchestrationThreadSearchSource,
  snippet: z.string().max(240),
  messageCreatedAt: IsoDateTime.nullable(),
});
export type OrchestrationThreadSearchMatch = z.infer<typeof OrchestrationThreadSearchMatch>;
export const OrchestrationSearchThreadsResult = z.looseObject({
  matches: z.array(OrchestrationThreadSearchMatch),
});
export type OrchestrationSearchThreadsResult = z.infer<typeof OrchestrationSearchThreadsResult>;

export const OrchestrationGetWorkflowScriptInput = z.looseObject({
  threadId: ThreadId,
  scriptPath: TrimmedNonEmptyString,
});
export type OrchestrationGetWorkflowScriptInput = z.infer<
  typeof OrchestrationGetWorkflowScriptInput
>;
export const OrchestrationGetWorkflowScriptResult = z.looseObject({
  scriptPath: TrimmedNonEmptyString,
  contents: z.string(),
  truncated: z.boolean(),
});
export type OrchestrationGetWorkflowScriptResult = z.infer<
  typeof OrchestrationGetWorkflowScriptResult
>;

/** Stops a workflow run by its coordinator subagent. */
export const OrchestrationV2StopWorkflowInput = z.looseObject({
  threadId: ThreadId,
  subagentId: NodeId,
});
export type OrchestrationV2StopWorkflowInput = z.infer<typeof OrchestrationV2StopWorkflowInput>;
