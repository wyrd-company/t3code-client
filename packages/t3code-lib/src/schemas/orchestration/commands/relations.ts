// ---
// relationships:
//   implements: library
// ---
/** Fork, merge-back, and delegated-task commands of `OrchestrationV2Command`. */
import { z } from "zod";
import {
  CommandId,
  IsoDateTime,
  NodeId,
  RunId,
  ThreadId,
  TrimmedNonEmptyString,
  forwardCompatibleLiteral,
} from "../../common.ts";
import { OrchestrationV2ThreadForkSourcePoint } from "../context.ts";
import {
  ModelSelection,
  OrchestrationV2CreationFields,
  ProviderInteractionMode,
  RuntimeMode,
} from "../model.ts";
import { OrchestrationV2ThreadLaunchWorkspaceStrategy } from "../runs.ts";

export const ThreadForkCommand = z.looseObject({
  type: z.literal("thread.fork"),
  ...OrchestrationV2CreationFields,
  commandId: CommandId,
  sourceThreadId: ThreadId,
  targetThreadId: ThreadId,
  sourcePoint: OrchestrationV2ThreadForkSourcePoint,
  title: TrimmedNonEmptyString.optional(),
  createdAt: IsoDateTime.optional(),
});
export const ThreadMergeBackCommand = z.looseObject({
  type: z.literal("thread.merge_back"),
  ...OrchestrationV2CreationFields,
  commandId: CommandId,
  sourceThreadId: ThreadId,
  targetThreadId: ThreadId,
  sourcePoint: OrchestrationV2ThreadForkSourcePoint,
  createdAt: IsoDateTime.optional(),
});
const parent = { commandId: CommandId, parentThreadId: ThreadId } as const;
export const DelegatedTaskRequestCommand = z.looseObject({
  type: z.literal("delegated_task.request"),
  ...OrchestrationV2CreationFields,
  ...parent,
  parentRunId: RunId,
  parentNodeId: NodeId,
  task: TrimmedNonEmptyString,
  title: TrimmedNonEmptyString.optional(),
  modelSelection: ModelSelection,
  runtimeMode: RuntimeMode,
  interactionMode: ProviderInteractionMode,
  workspaceStrategy: OrchestrationV2ThreadLaunchWorkspaceStrategy.optional(),
  completionWake: forwardCompatibleLiteral(["always", "settled_only"]).optional(),
  createdAt: IsoDateTime.optional(),
});
export const DelegatedTaskWakePolicyCommand = z.looseObject({
  type: z.literal("delegated_task.wake-policy"),
  ...parent,
  taskId: NodeId,
  completionWake: forwardCompatibleLiteral(["always", "settled_only"]),
});
export const DelegatedTaskCompletionDeliveryAcknowledgeCommand = z.looseObject({
  type: z.literal("delegated_task.completion-delivery.acknowledge"),
  ...parent,
  taskId: NodeId,
  observedByRunId: RunId.nullable(),
});
export const DelegatedTaskCompletionDeliveryDisposeCommand = z.looseObject({
  type: z.literal("delegated_task.completion-delivery.dispose"),
  ...parent,
  taskId: NodeId,
});
export const ThreadCreatedRecordCommand = z.looseObject({
  type: z.literal("thread.created.record"),
  ...parent,
  parentRunId: RunId,
  parentNodeId: NodeId,
  targetThreadId: ThreadId,
  targetRunId: RunId.nullable(),
});

export const relationCommandMembers = [
  ThreadForkCommand,
  ThreadMergeBackCommand,
  DelegatedTaskRequestCommand,
  DelegatedTaskWakePolicyCommand,
  DelegatedTaskCompletionDeliveryAcknowledgeCommand,
  DelegatedTaskCompletionDeliveryDisposeCommand,
  ThreadCreatedRecordCommand,
] as const;
