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
import { ThreadPullRequestKey } from "./pullRequest.ts";
import { OrchestrationV2LinkedSender } from "./threadLink.ts";

const notificationOutcomes = ["completed", "failed", "cancelled", "updated", "unknown"] as const;

/** One pull request's part of a wake that covers several. */
export const OrchestrationV2PullRequestWakeSection = z.looseObject({
  text: z.string(),
  outcome: forwardCompatibleLiteral(notificationOutcomes),
  summary: TrimmedNonEmptyString,
});
export type OrchestrationV2PullRequestWakeSection = z.infer<
  typeof OrchestrationV2PullRequestWakeSection
>;

/** The pull request watch a monitor wake reports on. */
export const OrchestrationV2MonitorPullRequestStamp = z.looseObject({
  ...ThreadPullRequestKey.shape,
  watchStartedAt: IsoDateTime,
  /** Null when the wake is not about one head, so a newer push does not outdate it. */
  headSha: TrimmedNonEmptyString.nullable(),
  watchEnded: z.boolean().optional(),
  /** Set on a wake covering several pull requests. */
  section: OrchestrationV2PullRequestWakeSection.optional(),
});
export type OrchestrationV2MonitorPullRequestStamp = z.infer<
  typeof OrchestrationV2MonitorPullRequestStamp
>;

export type OrchestrationV2NotificationSource =
  | {
      readonly kind: "delegated_task";
      readonly taskIds: NodeId[];
      readonly childThreadId?: ThreadId;
    }
  | { readonly kind: "subagent"; readonly childThreadId?: ThreadId }
  | { readonly kind: "command" }
  | {
      readonly kind: "monitor";
      readonly pullRequest?: OrchestrationV2MonitorPullRequestStamp;
      readonly otherPullRequests?: OrchestrationV2MonitorPullRequestStamp[];
    }
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
    pullRequest: OrchestrationV2MonitorPullRequestStamp.optional(),
    otherPullRequests: z.array(OrchestrationV2MonitorPullRequestStamp).optional(),
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
        return {
          kind: "monitor",
          ...(raw.pullRequest === undefined ? {} : { pullRequest: raw.pullRequest }),
          ...(raw.otherPullRequests === undefined
            ? {}
            : { otherPullRequests: raw.otherPullRequests }),
        };
      case "system":
        return { kind: "system" };
      default:
        return { kind: "background_task" };
    }
  });

/** A notification records an observed event; whether the agent has it is the server's concern. */
export const OrchestrationV2Notification = z.looseObject({
  source: OrchestrationV2NotificationSource,
  outcome: forwardCompatibleLiteral(notificationOutcomes),
  summary: TrimmedNonEmptyString,
  detail: z.string().optional(),
});
export type OrchestrationV2Notification = z.infer<typeof OrchestrationV2Notification>;

export const OrchestrationV2MessageRole = forwardCompatibleLiteral(["user", "assistant", "system"]);
export type OrchestrationV2MessageRole = z.infer<typeof OrchestrationV2MessageRole>;

/** Why T3 Code compacted a thread on its own, on the `/compact` it sent. */
export const OrchestrationV2IdleCompaction = forwardCompatibleLiteral([
  "beforeCacheExpires",
  "onReturn",
]);
export type OrchestrationV2IdleCompaction = z.infer<typeof OrchestrationV2IdleCompaction>;

export const OrchestrationV2ConversationMessage = z.looseObject({
  notification: OrchestrationV2Notification.optional(),
  ...OrchestrationV2CreationFields,
  scheduledTaskId: ScheduledTaskId.optional(),
  /** A scheduled delivery that named no model; it runs on the thread's selection at start. */
  followsThreadSelection: z.literal(true).optional(),
  idleCompaction: OrchestrationV2IdleCompaction.optional(),
  /** The sending agent's thread in this environment, separate from the receiving thread. */
  senderThreadId: ThreadId.optional(),
  /** The sending agent's thread in a linked environment, for a client that cannot reach it. */
  linkedSender: OrchestrationV2LinkedSender.optional(),
  /** Whether the message contains a provider-native workflow script. */
  workflowScript: z.boolean().optional(),
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
      preview: z.string().optional(),
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
