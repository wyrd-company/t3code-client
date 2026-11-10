// ---
// relationships:
//   implements: library
// ---
/** The known row types of a thread timeline, typed by `type`. */
import { z } from "zod";
import {
  CheckpointId,
  CheckpointScopeId,
  ContextHandoffId,
  IsoDateTime,
  MessageId,
  NodeId,
  NonNegativeInt,
  PlanId,
  ProviderDriverKind,
  ProviderInstanceId,
  ProviderThreadId,
  ProviderTurnId,
  RunId,
  RuntimeRequestId,
  ScheduledTaskId,
  ThreadId,
  TrimmedNonEmptyString,
  forwardCompatibleLiteral,
  taggedUnionWithUnknown,
} from "../common.ts";
import { ChatAttachment } from "./attachments.ts";
import { OrchestrationMessageContext } from "./messageContext.ts";
import {
  ModelSelection,
  OrchestrationV2CreationFields,
  ProviderApprovalOption,
  ProviderRequestKind,
  UserInputAttachmentAnswerPayload,
} from "./model.ts";
import {
  OrchestrationV2IdleCompaction,
  OrchestrationV2Notification,
  OrchestrationV2PlanStep,
  OrchestrationV2UserInputQuestion,
} from "./messages.ts";
import { OrchestrationV2CheckpointFileTotals } from "./runs.ts";
import { OrchestrationV2RemoteTaskChild } from "./threadLink.ts";
import {
  OrchestrationV2FileChangeDetail,
  OrchestrationV2FileSearchResult,
  OrchestrationV2LinkRequestFields,
  OrchestrationV2ProviderFailure,
  OrchestrationV2ProviderRetry,
  OrchestrationV2SecretRequestStatus,
  OrchestrationV2TurnItemBaseFields as base,
  OrchestrationV2UserMessageInputIntent,
  OrchestrationV2WebSearchResult,
} from "./turnItemParts.ts";

/** A same-harness model or effort change that took effect with this message. */
export const OrchestrationV2ModelSwitch = z.looseObject({
  from: ModelSelection,
  to: ModelSelection,
});
export type OrchestrationV2ModelSwitch = z.infer<typeof OrchestrationV2ModelSwitch>;

const forkSource = taggedUnionWithUnknown("type", [
  z.looseObject({ type: z.literal("run"), threadId: ThreadId, runId: RunId }),
  z.looseObject({ type: z.literal("node"), nodeId: NodeId }),
  z.looseObject({
    type: z.literal("provider_thread"),
    providerThreadId: ProviderThreadId,
    providerTurnId: ProviderTurnId.optional(),
  }),
]);

export const OrchestrationV2TurnItemMembers = [
  z.looseObject({ ...base, type: z.literal("notification"), ...OrchestrationV2Notification.shape }),
  z.looseObject({
    ...base,
    ...OrchestrationV2CreationFields,
    type: z.literal("user_message"),
    messageId: MessageId,
    scheduledTaskId: ScheduledTaskId.optional(),
    senderThreadId: ThreadId.optional(),
    idleCompaction: OrchestrationV2IdleCompaction.optional(),
    workflowScript: z.boolean().optional(),
    freshContext: z.boolean().optional(),
    inputIntent: OrchestrationV2UserMessageInputIntent,
    text: z.string(),
    context: OrchestrationMessageContext.optional(),
    attachments: z.array(ChatAttachment),
    modelSwitch: OrchestrationV2ModelSwitch.optional(),
  }),
  z.looseObject({
    ...base,
    type: z.literal("assistant_message"),
    messageId: MessageId,
    text: z.string(),
    attachments: z.array(ChatAttachment).optional(),
    streaming: z.boolean(),
  }),
  z.looseObject({
    ...base,
    type: z.literal("reasoning"),
    text: z.string(),
    streaming: z.boolean(),
  }),
  z.looseObject({
    ...base,
    type: z.literal("proposed_plan"),
    planId: PlanId,
    markdown: z.string(),
    streaming: z.boolean(),
  }),
  z.looseObject({
    ...base,
    type: z.literal("todo_list"),
    planId: PlanId,
    steps: z.array(OrchestrationV2PlanStep),
    explanation: z.string().optional(),
  }),
  z.looseObject({
    ...base,
    type: z.literal("user_input_request"),
    requestId: RuntimeRequestId,
    questions: z.array(OrchestrationV2UserInputQuestion),
    questionAnswer: UserInputAttachmentAnswerPayload.optional(),
    responseMode: z.literal("message").optional(),
  }),
  z.looseObject({
    ...base,
    type: z.literal("file_change"),
    fileName: TrimmedNonEmptyString,
    additions: NonNegativeInt.optional(),
    deletions: NonNegativeInt.optional(),
    diffStr: z.string().optional(),
    oldStr: z.string().optional(),
    newStr: z.string().optional(),
    changes: z.array(OrchestrationV2FileChangeDetail).optional(),
  }),
  z.looseObject({
    ...base,
    type: z.literal("command_execution"),
    input: z.string(),
    output: z.string().optional(),
    /** Set on the wire when output was withheld; fetch it with `orchestration.getTurnItem`. */
    outputOmitted: z.boolean().optional(),
    outputIndicatesFailure: z.boolean().optional(),
    exitCode: z.number().int().optional(),
    /** Set when the command is a monitor, so background work lists it as a monitor. */
    monitor: z.boolean().optional(),
  }),
  z.looseObject({
    ...base,
    type: z.literal("file_search"),
    pattern: z.string().optional(),
    results: z.array(OrchestrationV2FileSearchResult).optional(),
  }),
  z.looseObject({
    ...base,
    type: z.literal("web_search"),
    patterns: z.array(z.string()).optional(),
    results: z.array(OrchestrationV2WebSearchResult).optional(),
  }),
  z.looseObject({
    ...base,
    type: z.literal("approval_request"),
    requestId: RuntimeRequestId,
    requestKind: ProviderRequestKind,
    prompt: z.string().optional(),
    reason: z.string().optional(),
    fullAccessOverride: forwardCompatibleLiteral(["ask_rule", "provider_check"]).optional(),
    appName: z.string().optional(),
    options: z.array(ProviderApprovalOption).optional(),
  }),
  z.looseObject({
    ...base,
    type: z.literal("checkpoint"),
    checkpointId: CheckpointId,
    scopeId: CheckpointScopeId,
    files: z.array(
      z.looseObject({
        path: TrimmedNonEmptyString,
        kind: TrimmedNonEmptyString,
        additions: NonNegativeInt,
        deletions: NonNegativeInt,
      }),
    ),
    filesTotal: OrchestrationV2CheckpointFileTotals.optional(),
  }),
  z.looseObject({
    ...base,
    type: z.literal("run_interrupt_request"),
    message: z.string(),
    /** Set when the provider did not confirm the stop in time; a client can then force stop. */
    unresponsiveAt: IsoDateTime.optional(),
  }),
  z.looseObject({ ...base, type: z.literal("run_interrupt_result"), message: z.string() }),
  z.looseObject({ ...base, type: z.literal("system_notice"), message: z.string() }),
  z.looseObject({
    ...base,
    type: z.literal("error"),
    failure: OrchestrationV2ProviderFailure,
    retry: OrchestrationV2ProviderRetry.optional(),
  }),
  z.looseObject({
    ...base,
    type: z.literal("compaction"),
    driver: ProviderDriverKind.nullable(),
    summary: z.string().optional(),
    beforeTokenCount: NonNegativeInt.optional(),
    afterTokenCount: NonNegativeInt.optional(),
  }),
  z.looseObject({
    ...base,
    type: z.literal("handoff"),
    contextHandoffId: ContextHandoffId,
    fromProviderThreadIds: z.array(ProviderThreadId),
    toProviderThreadId: ProviderThreadId,
    fromProviderInstanceIds: z.array(ProviderInstanceId),
    toProviderInstanceId: ProviderInstanceId,
    fromModelSelections: z.array(ModelSelection).optional(),
    toModel: z.string().optional(),
    strategy: forwardCompatibleLiteral([
      "delta_since_target_last_seen",
      "fork_delta_summary",
      "full_thread_summary",
      "checkpoint_summary",
      "manual_context",
    ]),
    summary: z.string().optional(),
  }),
  z.looseObject({
    ...base,
    type: z.literal("fork"),
    source: forkSource,
    targetThreadId: ThreadId,
    providerThreadId: ProviderThreadId.optional(),
  }),
  z.looseObject({
    ...base,
    type: z.literal("thread_created"),
    targetThreadId: ThreadId,
    targetRunId: RunId.nullable(),
    targetProviderInstanceId: ProviderInstanceId,
    targetModel: TrimmedNonEmptyString,
  }),
  z.looseObject({
    ...base,
    type: z.literal("secret_request"),
    label: TrimmedNonEmptyString,
    reason: z.string(),
    url: z.string().optional(),
    placeholder: z.string().optional(),
    secretStatus: OrchestrationV2SecretRequestStatus,
    /** The agent asked for the secret as a file. */
    delivery: forwardCompatibleLiteral(["file"]).optional(),
  }),
  z.looseObject({ ...base, ...OrchestrationV2LinkRequestFields }),
  z.looseObject({
    ...base,
    type: z.literal("subagent"),
    subagentId: NodeId,
    origin: forwardCompatibleLiteral(["provider_native", "app_owned"]),
    driver: ProviderDriverKind,
    providerInstanceId: ProviderInstanceId,
    childThreadId: ThreadId.nullable(),
    remoteChild: OrchestrationV2RemoteTaskChild.optional(),
    prompt: z.string(),
    progress: z.string().nullable().optional(),
    result: z.string().nullable(),
  }),
  z.looseObject({
    ...base,
    type: z.literal("dynamic_tool"),
    toolName: TrimmedNonEmptyString.nullable(),
    viewedImagePath: TrimmedNonEmptyString.optional(),
    input: z.unknown(),
    output: z.unknown().optional(),
    outputOmitted: z.boolean().optional(),
  }),
] as const;
