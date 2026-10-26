// ---
// relationships:
//   implements: library
// ---
/** Messages, queue, runtime requests, and rollback commands of `OrchestrationV2Command`. */
import { z } from "zod";
import {
  CheckpointId,
  CheckpointScopeId,
  CommandId,
  MessageId,
  NodeId,
  PlanId,
  PositiveInt,
  RunId,
  RuntimeRequestId,
  ScheduledTaskId,
  ThreadId,
  TrimmedNonEmptyString,
  forwardCompatibleLiteral,
} from "../../common.ts";
import { ChatAttachment } from "../attachments.ts";
import { OrchestrationMessageContext } from "../messageContext.ts";
import { OrchestrationV2Notification } from "../messages.ts";
import {
  ModelSelection,
  OrchestrationV2CreationFields,
  ProviderApprovalDecision,
  ProviderUserInputAnswers,
  UserInputAttachments,
} from "../model.ts";
import { OrchestrationV2ThreadLaunchWorkspaceStrategy } from "../runs.ts";
import { OrchestrationV2ProviderFailure } from "../turnItemParts.ts";

const stamped = { commandId: CommandId, threadId: ThreadId } as const;

export const MessageDispatchMode = z.discriminatedUnion("type", [
  z.looseObject({
    type: z.literal("defer_start"),
    workspaceStrategy: OrchestrationV2ThreadLaunchWorkspaceStrategy.optional(),
  }),
  z.looseObject({ type: z.literal("steer_active"), targetRunId: RunId }),
  z.looseObject({ type: z.literal("restart_active"), targetRunId: RunId }),
  z.looseObject({ type: z.literal("queue_after_active") }),
  z.looseObject({ type: z.literal("start_immediately") }),
]);
export type MessageDispatchMode = z.infer<typeof MessageDispatchMode>;
export const MessageDeliveryIntent = forwardCompatibleLiteral(["auto", "steer", "restart"]);
export type MessageDeliveryIntent = z.infer<typeof MessageDeliveryIntent>;

export const MessageDispatchCommand = z.looseObject({
  type: z.literal("message.dispatch"),
  notification: OrchestrationV2Notification.optional(),
  ...OrchestrationV2CreationFields,
  scheduledTaskId: ScheduledTaskId.optional(),
  senderThreadId: ThreadId.optional(),
  ...stamped,
  messageId: MessageId,
  text: z.string(),
  context: OrchestrationMessageContext.optional(),
  attachments: z.array(ChatAttachment),
  /** Seed the temporary title and generate a durable replacement for the first message. */
  titleSeed: TrimmedNonEmptyString.optional(),
  modelSelection: ModelSelection.optional(),
  sourcePlanRef: z.looseObject({ threadId: ThreadId, planId: PlanId }).optional(),
  restartContinuationOfRunId: RunId.optional(),
  usageLimitContinuationOfRunId: RunId.optional(),
  manualContinuationOfRunId: RunId.optional(),
  usageLimitRecoveryRequestId: CommandId.optional(),
  /** Let the server resolve steer, queue, or start against its serialized thread state. */
  deliveryIntent: MessageDeliveryIntent.optional(),
  delegatedCompletion: z
    .looseObject({ parentRunId: RunId, generation: PositiveInt, taskIds: z.array(NodeId) })
    .optional(),
  dispatchMode: MessageDispatchMode,
});
export type MessageDispatchCommand = z.infer<typeof MessageDispatchCommand>;

const run = { ...stamped, runId: RunId } as const;
export const PreparedRunReleaseCommand = z.looseObject({
  type: z.literal("prepared-run.release"),
  ...run,
});
export const PreparedRunProgressCommand = z.looseObject({
  type: z.literal("prepared-run.progress"),
  ...run,
  phase: forwardCompatibleLiteral(["worktree", "setup"]),
});
export const PreparedRunFailCommand = z.looseObject({
  type: z.literal("prepared-run.fail"),
  ...run,
  failure: OrchestrationV2ProviderFailure,
});
/** Puts a run whose workspace preparation failed back into preparation. */
export const PreparedRunRetryCommand = z.looseObject({
  type: z.literal("prepared-run.retry"),
  ...run,
});
export const NotificationDeliveryAcceptCommand = z.looseObject({
  type: z.literal("notification.delivery.accept"),
  ...stamped,
  messageId: MessageId,
});
/** Stops one provider-native child while its owning run keeps working. */
export const SubagentStopCommand = z.looseObject({
  type: z.literal("subagent.stop"),
  ...run,
  subagentId: NodeId,
});
export const RunInterruptCommand = z.looseObject({
  type: z.literal("run.interrupt"),
  ...run,
  reason: z.string().optional(),
  /** The Stop button: also holds the queue, ends pull request watches, and stops delegated tasks. */
  holdQueue: z.boolean().optional(),
});
export type RunInterruptCommand = z.infer<typeof RunInterruptCommand>;
export const QueuedMessagePromoteToSteerCommand = z.looseObject({
  type: z.literal("queued-message.promote-to-steer"),
  ...stamped,
  queuedRunId: RunId,
  targetRunId: RunId,
});
export const QueueResumeCommand = z.looseObject({ type: z.literal("queue.resume"), ...stamped });
/**
 * Start one queued run now. The server accepts it only while the thread is
 * stopped and the run is a queued plain user message; otherwise it answers
 * with `OrchestrationV2DispatchCommandError`.
 */
export const QueuedRunStartCommand = z.looseObject({
  type: z.literal("queued-run.start"),
  ...run,
});
export type QueuedRunStartCommand = z.infer<typeof QueuedRunStartCommand>;
export const QueuedRunReorderCommand = z.looseObject({
  type: z.literal("queued-run.reorder"),
  ...run,
  beforeRunId: RunId.nullable(),
});
export const QueuedRunCancelCommand = z.looseObject({
  type: z.literal("queued-run.cancel"),
  ...run,
});
export const QueuedRunEditCommand = z.looseObject({
  type: z.literal("queued-run.edit"),
  context: OrchestrationMessageContext.optional(),
  ...run,
  text: z.string(),
  attachments: z.array(ChatAttachment).optional(),
});
export const RuntimeRequestRespondCommand = z.looseObject({
  type: z.literal("runtime-request.respond"),
  ...stamped,
  requestId: RuntimeRequestId,
  decision: ProviderApprovalDecision.optional(),
  answers: ProviderUserInputAnswers.optional(),
  attachmentsByQuestionId: UserInputAttachments.optional(),
});
export type RuntimeRequestRespondCommand = z.infer<typeof RuntimeRequestRespondCommand>;
export const ThreadUserInputDismissCommand = z.looseObject({
  type: z.literal("thread.user-input.dismiss"),
  ...stamped,
  requestId: RuntimeRequestId,
});
export const CheckpointRollbackCommand = z.looseObject({
  type: z.literal("checkpoint.rollback"),
  restoreFiles: z.boolean().optional(),
  ...stamped,
  scopeId: CheckpointScopeId,
  checkpointId: CheckpointId,
});

export const messageCommandMembers = [
  MessageDispatchCommand,
  PreparedRunReleaseCommand,
  NotificationDeliveryAcceptCommand,
  PreparedRunProgressCommand,
  PreparedRunFailCommand,
  PreparedRunRetryCommand,
  SubagentStopCommand,
  RunInterruptCommand,
  QueuedMessagePromoteToSteerCommand,
  QueueResumeCommand,
  QueuedRunStartCommand,
  QueuedRunReorderCommand,
  QueuedRunCancelCommand,
  QueuedRunEditCommand,
  RuntimeRequestRespondCommand,
  ThreadUserInputDismissCommand,
  CheckpointRollbackCommand,
] as const;
