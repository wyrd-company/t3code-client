// ---
// relationships:
//   implements: library
// ---
/**
 * The timeline rows of a thread, typed by `type`. A row of a type this build
 * does not know decodes as `{ unknown: true, raw }`; arrays of rows drop it.
 */
import { z } from "zod";
import {
  CheckpointId,
  CheckpointScopeId,
  ContextHandoffId,
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
  TurnItemId,
  forwardCompatibleLiteral,
  isUnknownVariant,
  knownMembersArray,
  taggedUnionWithUnknown,
  type UnknownVariant,
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
  OrchestrationV2Notification,
  OrchestrationV2PlanStep,
  OrchestrationV2UserInputQuestion,
} from "./messages.ts";
import {
  OrchestrationV2FileChangeDetail,
  OrchestrationV2FileSearchResult,
  OrchestrationV2ProviderFailure,
  OrchestrationV2ProviderRetry,
  OrchestrationV2SecretRequestStatus,
  OrchestrationV2TurnItemBaseFields as base,
  OrchestrationV2UserMessageInputIntent,
  OrchestrationV2WebSearchResult,
} from "./turnItemParts.ts";

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
    workflowScript: z.boolean().optional(),
    inputIntent: OrchestrationV2UserMessageInputIntent,
    text: z.string(),
    context: OrchestrationMessageContext.optional(),
    attachments: z.array(ChatAttachment),
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
  }),
  z.looseObject({ ...base, type: z.literal("run_interrupt_request"), message: z.string() }),
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
    placeholder: z.string().optional(),
    secretStatus: OrchestrationV2SecretRequestStatus,
  }),
  z.looseObject({
    ...base,
    type: z.literal("subagent"),
    subagentId: NodeId,
    origin: forwardCompatibleLiteral(["provider_native", "app_owned"]),
    driver: ProviderDriverKind,
    providerInstanceId: ProviderInstanceId,
    childThreadId: ThreadId.nullable(),
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

/** A turn item of any type, including a type this build does not know. */
export const OrchestrationV2TurnItem = taggedUnionWithUnknown(
  "type",
  OrchestrationV2TurnItemMembers,
);
export type OrchestrationV2TurnItem = z.infer<typeof OrchestrationV2TurnItem>;
export type KnownOrchestrationV2TurnItem = Exclude<OrchestrationV2TurnItem, UnknownVariant<"type">>;
export type OrchestrationV2TurnItemType = KnownOrchestrationV2TurnItem["type"];
export type OrchestrationV2TurnItemOfType<T extends OrchestrationV2TurnItemType> = Extract<
  KnownOrchestrationV2TurnItem,
  { type: T }
>;

/** Narrow a known timeline item to the requested item type. */
export function isTurnItemOfType<const T extends OrchestrationV2TurnItemType>(
  item: OrchestrationV2TurnItem,
  type: T,
): item is OrchestrationV2TurnItemOfType<T> {
  return !isUnknownVariant<"type">(item) && item.type === type;
}

/** Turn items as a projection carries them: rows of unknown types are dropped. */
export const OrchestrationV2TurnItems = knownMembersArray(OrchestrationV2TurnItem);

export const OrchestrationV2ProjectedTurnItem = z.looseObject({
  position: NonNegativeInt,
  visibility: forwardCompatibleLiteral(["local", "inherited", "synthetic"]),
  sourceThreadId: ThreadId,
  sourceItemId: TurnItemId,
  item: OrchestrationV2TurnItem,
});
export type OrchestrationV2ProjectedTurnItem = z.infer<typeof OrchestrationV2ProjectedTurnItem> & {
  readonly item: KnownOrchestrationV2TurnItem;
};
/** Projected rows whose nested item is of a type this build does not know are dropped. */
export const OrchestrationV2ProjectedTurnItems: z.ZodType<
  OrchestrationV2ProjectedTurnItem[],
  unknown
> = z
  .array(OrchestrationV2ProjectedTurnItem)
  .transform((rows) =>
    rows.filter(
      (row): row is OrchestrationV2ProjectedTurnItem => !isUnknownVariant<"type">(row.item),
    ),
  );
