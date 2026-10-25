// ---
// relationships:
//   implements: library
// ---
/** Context handoffs and transfers between provider threads, from `orchestrationV2.ts`. */
import { z } from "zod";
import {
  CheckpointId,
  ContextHandoffId,
  ContextTransferId,
  IsoDateTime,
  MessageId,
  NonNegativeInt,
  PositiveInt,
  ProviderInstanceId,
  ProviderThreadId,
  RunId,
  ThreadId,
  TurnItemId,
  forwardCompatibleLiteral,
  taggedUnionWithUnknown,
} from "../common.ts";
import { OrchestrationV2Actor, OrchestrationV2ProviderRef } from "./model.ts";
import { OrchestrationV2ProviderTurnTokenUsage } from "./providerState.ts";

export const OrchestrationV2ContextTransferType = forwardCompatibleLiteral([
  "fork",
  "provider_handoff",
  "merge_back",
  "subagent_spawn",
  "subagent_result",
]);
export const OrchestrationV2ContextSourcePoint = z.looseObject({
  threadId: ThreadId,
  runId: RunId.optional(),
  checkpointId: CheckpointId.optional(),
  turnItemId: TurnItemId.optional(),
  providerThreadRef: OrchestrationV2ProviderRef.optional(),
  providerTurnRef: OrchestrationV2ProviderRef.optional(),
});
export type OrchestrationV2ContextSourcePoint = z.infer<typeof OrchestrationV2ContextSourcePoint>;

/** Where a fork or merge-back takes its context from; strict because callers send it. */
export const OrchestrationV2ThreadForkSourcePoint = z.discriminatedUnion("type", [
  z.looseObject({ type: z.literal("latest_stable") }),
  z.looseObject({ type: z.literal("run"), runId: RunId }),
  z.looseObject({ type: z.literal("checkpoint"), checkpointId: CheckpointId }),
]);
export type OrchestrationV2ThreadForkSourcePoint = z.infer<
  typeof OrchestrationV2ThreadForkSourcePoint
>;

export const OrchestrationV2ContextTransferResolution = taggedUnionWithUnknown("strategy", [
  z.looseObject({
    strategy: z.literal("native_fork"),
    providerThreadRef: OrchestrationV2ProviderRef,
  }),
  z.looseObject({ strategy: z.literal("portable_context"), contextHandoffId: ContextHandoffId }),
  z.looseObject({ strategy: z.literal("delta_context"), contextHandoffId: ContextHandoffId }),
  z.looseObject({ strategy: z.literal("fork_delta_context"), contextHandoffId: ContextHandoffId }),
  z.looseObject({ strategy: z.literal("checkpoint_context"), contextHandoffId: ContextHandoffId }),
]);

export const OrchestrationV2ContextTransfer = z.looseObject({
  id: ContextTransferId,
  type: OrchestrationV2ContextTransferType,
  sourceThreadId: ThreadId,
  targetThreadId: ThreadId,
  sourcePoint: OrchestrationV2ContextSourcePoint,
  basePoint: OrchestrationV2ContextSourcePoint.nullable(),
  sourceProviderInstanceId: ProviderInstanceId.nullable(),
  sourceTokenUsage: OrchestrationV2ProviderTurnTokenUsage.optional(),
  targetProviderInstanceId: ProviderInstanceId.nullable(),
  targetRunId: RunId.nullable(),
  status: forwardCompatibleLiteral([
    "pending",
    "resolved_native",
    "resolved_portable",
    "failed",
    "consumed",
    "superseded",
  ]),
  resolution: OrchestrationV2ContextTransferResolution.nullable(),
  createdBy: OrchestrationV2Actor,
  error: z.string().nullable(),
  createdAt: IsoDateTime,
  updatedAt: IsoDateTime,
  consumedAt: IsoDateTime.nullable(),
});
export type OrchestrationV2ContextTransfer = z.infer<typeof OrchestrationV2ContextTransfer>;

export const OrchestrationV2HistoricalMessage = z.looseObject({
  role: forwardCompatibleLiteral(["user", "assistant"]),
  text: z.string(),
  runStatus: z.string().optional(),
  threadId: ThreadId,
  runId: RunId.nullable(),
  itemId: TurnItemId,
  providerThreadId: ProviderThreadId.nullable(),
  status: z.string(),
  kind: z.string(),
});
export type OrchestrationV2HistoricalMessage = z.infer<typeof OrchestrationV2HistoricalMessage>;

export const OrchestrationV2ContextHandoffStrategy = forwardCompatibleLiteral([
  "delta_since_target_last_seen",
  "fork_delta_summary",
  "full_thread_summary",
  "checkpoint_summary",
  "manual_context",
]);
export const OrchestrationV2ContextHandoff = z.looseObject({
  id: ContextHandoffId,
  transferId: ContextTransferId.nullable().optional(),
  threadId: ThreadId,
  targetRunId: RunId,
  fromProviderThreadIds: z.array(ProviderThreadId),
  toProviderThreadId: ProviderThreadId,
  coveredRunOrdinals: z.looseObject({ from: PositiveInt, to: PositiveInt }),
  strategy: OrchestrationV2ContextHandoffStrategy,
  status: forwardCompatibleLiteral(["pending", "ready", "failed", "superseded"]),
  summaryMessageId: MessageId.nullable(),
  summaryText: z.string(),
  history: z
    .looseObject({
      messages: z.array(OrchestrationV2HistoricalMessage),
      coverage: z.string(),
      omittedItems: NonNegativeInt,
      omittedItemIds: z.array(TurnItemId).optional(),
    })
    .optional(),
  delivery: z
    .looseObject({
      nativeThreadId: z.string(),
      status: forwardCompatibleLiteral(["pending", "injected", "inline"]),
      itemIds: z.array(TurnItemId),
      omittedItemIds: z.array(TurnItemId).optional(),
    })
    .optional(),
  detailInTurnItem: z.literal(true).optional(),
  createdByProviderInstanceId: ProviderInstanceId.nullable(),
  createdAt: IsoDateTime,
  updatedAt: IsoDateTime,
});
export type OrchestrationV2ContextHandoff = z.infer<typeof OrchestrationV2ContextHandoff>;
