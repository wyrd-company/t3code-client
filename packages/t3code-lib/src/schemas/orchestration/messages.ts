// ---
// relationships:
//   implements: library
// ---
/** Conversation messages, notifications, plans, and questions of `orchestrationV2.ts`. */
import { z } from "zod";
import {
  IsoDateTime,
  MessageId,
  NodeId,
  NonNegativeInt,
  PlanId,
  PositiveInt,
  RunId,
  ScheduledTaskId,
  ThreadId,
  TrimmedNonEmptyString,
  forwardCompatibleLiteral,
  taggedUnionWithUnknown,
} from "../common.ts";
import { ChatAttachment } from "./attachments.ts";
import { OrchestrationMessageContext } from "./messageContext.ts";
import { OrchestrationV2CreationFields } from "./model.ts";

export type OrchestrationV2NotificationSource =
  | {
      readonly kind: "delegated_task";
      readonly taskIds: NodeId[];
      readonly childThreadId?: ThreadId;
    }
  | { readonly kind: "subagent"; readonly childThreadId?: ThreadId }
  | { readonly kind: "command" }
  | { readonly kind: "monitor" }
  | { readonly kind: "background_task" }
  | { readonly kind: "system" };

/**
 * What a notification reports on. The wire still carries the shapes clients
 * before `subagent` and `command` existed decode (`background_task` with
 * `work: "subagent"`, `background_command`); both are read into the plain
 * kinds. A kind this build does not know is `background_task`.
 */
export const OrchestrationV2NotificationSource: z.ZodType<
  OrchestrationV2NotificationSource,
  unknown
> = z
  .looseObject({
    kind: z.string(),
    work: z.string().optional(),
    taskIds: z.array(NodeId).optional(),
    childThreadId: ThreadId.optional(),
  })
  .transform((raw): OrchestrationV2NotificationSource => {
    const child = raw.childThreadId === undefined ? {} : { childThreadId: raw.childThreadId };
    switch (raw.kind) {
      case "delegated_task":
        return { kind: "delegated_task", taskIds: raw.taskIds ?? [], ...child };
      case "subagent":
        return { kind: "subagent", ...child };
      case "background_task":
        return raw.work === "subagent"
          ? { kind: "subagent", ...child }
          : { kind: "background_task" };
      case "background_command":
      case "command":
        return { kind: "command" };
      case "monitor":
        return { kind: "monitor" };
      case "system":
        return { kind: "system" };
      default:
        return { kind: "background_task" };
    }
  });

/** A notification records an observed event; whether the agent has it is the server's concern. */
export const OrchestrationV2Notification = z.looseObject({
  source: OrchestrationV2NotificationSource,
  outcome: forwardCompatibleLiteral(["completed", "failed", "cancelled", "updated", "unknown"]),
  summary: TrimmedNonEmptyString,
  detail: z.string().optional(),
});
export type OrchestrationV2Notification = z.infer<typeof OrchestrationV2Notification>;

export const OrchestrationV2MessageRole = forwardCompatibleLiteral(["user", "assistant", "system"]);
export type OrchestrationV2MessageRole = z.infer<typeof OrchestrationV2MessageRole>;

export const OrchestrationV2ConversationMessage = z.looseObject({
  notification: OrchestrationV2Notification.optional(),
  ...OrchestrationV2CreationFields,
  scheduledTaskId: ScheduledTaskId.optional(),
  /** The sending agent's thread in this environment, separate from the receiving thread. */
  senderThreadId: ThreadId.optional(),
  id: MessageId,
  threadId: ThreadId,
  runId: RunId.nullable(),
  nodeId: NodeId.nullable(),
  role: OrchestrationV2MessageRole,
  text: z.string(),
  context: OrchestrationMessageContext.optional(),
  attachments: z.array(ChatAttachment),
  streaming: z.boolean(),
  createdAt: IsoDateTime,
  updatedAt: IsoDateTime,
  delegatedCompletion: z
    .looseObject({ parentRunId: RunId, generation: PositiveInt, taskIds: z.array(NodeId) })
    .optional(),
});
export type OrchestrationV2ConversationMessage = z.infer<typeof OrchestrationV2ConversationMessage>;

export const OrchestrationV2PlanStep = z.looseObject({
  id: TrimmedNonEmptyString,
  text: TrimmedNonEmptyString,
  status: forwardCompatibleLiteral(["pending", "running", "completed"]),
  durationAnchorAt: IsoDateTime.optional(),
  durationMs: NonNegativeInt.optional(),
});
export type OrchestrationV2PlanStep = z.infer<typeof OrchestrationV2PlanStep>;

export const OrchestrationV2UserInputQuestion = z.looseObject({
  id: TrimmedNonEmptyString,
  header: TrimmedNonEmptyString,
  question: TrimmedNonEmptyString,
  options: z.array(
    z.looseObject({
      label: TrimmedNonEmptyString,
      description: TrimmedNonEmptyString,
      value: z.string().optional(),
    }),
  ),
  multiSelect: z.boolean().optional(),
  allowCustomAnswer: z.boolean().optional(),
  /** Editable initial text; an answer may then be an empty string. */
  initialAnswer: z.string().optional(),
  required: z.boolean().optional(),
});
export type OrchestrationV2UserInputQuestion = z.infer<typeof OrchestrationV2UserInputQuestion>;

const planArtifactBase = {
  id: PlanId,
  threadId: ThreadId,
  runId: RunId.nullable(),
  nodeId: NodeId,
  status: forwardCompatibleLiteral(["draft", "active", "completed", "superseded"]),
  detailInTurnItem: z.literal(true).optional(),
} as const;
export const OrchestrationV2PlanArtifact = taggedUnionWithUnknown("kind", [
  z.looseObject({ ...planArtifactBase, kind: z.literal("proposed_plan"), markdown: z.string() }),
  z.looseObject({
    ...planArtifactBase,
    kind: z.literal("todo_list"),
    steps: z.array(OrchestrationV2PlanStep),
    explanation: z.string().optional(),
  }),
]);
export type OrchestrationV2PlanArtifact = z.infer<typeof OrchestrationV2PlanArtifact>;
