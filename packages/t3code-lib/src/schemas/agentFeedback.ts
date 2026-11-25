// ---
// relationships:
//   implements: library
// ---
/** Reports an agent asks to send to the T3 team, shown to the user for approval (`agentFeedback.ts`). */
import { z } from "zod";
import { ThreadId, TurnItemId, forwardCompatibleLiteral } from "./common.ts";

export const AgentFeedbackKind = forwardCompatibleLiteral([
  "bug",
  "confusing",
  "missing_capability",
  "wrong_docs",
  "other",
]);
export type AgentFeedbackKind = z.infer<typeof AgentFeedbackKind>;

/** Built by the server from the thread's stored items; the agent never writes it. */
export const AgentFeedbackTrace = z.looseObject({
  turns: z.number().int(),
  textTurns: z.number().int(),
  /** A cap dropped an entry or cut or dropped a message text. */
  truncated: z.boolean(),
  entries: z.array(
    z.looseObject({
      turn: z.number().int(),
      type: forwardCompatibleLiteral(["user", "assistant", "tool"]),
      tool: z.string().optional(),
      outcome: forwardCompatibleLiteral(["ok", "error", "unfinished"]).optional(),
      durationMs: z.number().int().optional(),
      /** A message's length in characters. */
      length: z.number().int().optional(),
      text: z.string().optional(),
    }),
  ),
});
export type AgentFeedbackTrace = z.infer<typeof AgentFeedbackTrace>;

/** Exactly what a requested report sends once the user approves it, already scrubbed. */
export const AgentFeedbackPreview = z.looseObject({
  kind: AgentFeedbackKind,
  subject: z.string(),
  expected: z.string(),
  actual: z.string(),
  workaround: z.string(),
  trace: AgentFeedbackTrace.nullable(),
});
export type AgentFeedbackPreview = z.infer<typeof AgentFeedbackPreview>;

export const AgentFeedbackRequestStatus = forwardCompatibleLiteral([
  "pending",
  "sent",
  "declined",
  "cancelled",
]);
export type AgentFeedbackRequestStatus = z.infer<typeof AgentFeedbackRequestStatus>;

/**
 * The fields of a `feedback_request` turn item. Send stores and sends exactly `preview`, with
 * `conversationTrace` as its trace if the user includes the conversation. Once answered, the
 * card keeps only what was sent.
 */
export const OrchestrationV2FeedbackRequestFields = {
  type: z.literal("feedback_request"),
  preview: AgentFeedbackPreview,
  /** The preview's trace with message text, sent instead if the user includes the conversation. */
  conversationTrace: AgentFeedbackTrace.optional(),
  feedbackStatus: AgentFeedbackRequestStatus,
} as const;

/** `agentFeedback.answerRequest`: send or decline one pending report card. */
export const AgentFeedbackAnswerInput = z.looseObject({
  threadId: ThreadId,
  turnItemId: TurnItemId,
  answer: z.enum(["send", "decline"]),
  /** Send the card's conversation trace instead of its outline. */
  includeConversation: z.boolean().optional(),
});
export type AgentFeedbackAnswerInput = z.infer<typeof AgentFeedbackAnswerInput>;
