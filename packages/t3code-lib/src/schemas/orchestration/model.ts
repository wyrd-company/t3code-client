// ---
// relationships:
//   implements: library
// ---
/**
 * Mirrors `modelSelection.ts` and `providerPolicy.ts` in the contracts, plus
 * the actor and creation-source vocabulary `orchestrationV2.ts` stamps on
 * threads, messages, and commands.
 */
import { z } from "zod";
import {
  JsonValue,
  NonNegativeInt,
  ProviderDriverKind,
  ProviderInstanceId,
  TrimmedNonEmptyString,
  forwardCompatibleLiteral,
  stringRecord,
} from "../common.ts";
import { ProviderOptionSelections } from "../provider.ts";
import {
  ChatFileAttachment,
  ChatImageAttachment,
  PROVIDER_SEND_TURN_MAX_ATTACHMENTS,
} from "./attachments.ts";

export { RuntimeMode } from "../provider.ts";
export { ModelCapabilities, ProviderOptionSelections } from "../provider.ts";

/** The historical `{ provider, model }` shape still decodes; `instanceId` is the routing key. */
export const ModelSelection = z.preprocess(
  (raw) => {
    if (raw && typeof raw === "object" && !Array.isArray(raw)) {
      const value = raw as Record<string, unknown>;
      return {
        ...Object.fromEntries(Object.entries(value).filter(([key]) => key !== "provider")),
        instanceId: value["instanceId"] !== undefined ? value["instanceId"] : value["provider"],
      };
    }
    return raw;
  },
  z.looseObject({
    instanceId: ProviderInstanceId,
    model: TrimmedNonEmptyString,
    options: ProviderOptionSelections.optional(),
  }),
);
export type ModelSelection = z.infer<typeof ModelSelection>;

export const ProviderApprovalPolicy = forwardCompatibleLiteral([
  "untrusted",
  "on-failure",
  "on-request",
  "never",
]);
export type ProviderApprovalPolicy = z.infer<typeof ProviderApprovalPolicy>;
export const ProviderSandboxMode = forwardCompatibleLiteral([
  "read-only",
  "workspace-write",
  "danger-full-access",
]);
export type ProviderSandboxMode = z.infer<typeof ProviderSandboxMode>;
export const DEFAULT_RUNTIME_MODE = "full-access" as const;
export const ProviderInteractionMode = forwardCompatibleLiteral(["default", "plan"]);
export type ProviderInteractionMode = z.infer<typeof ProviderInteractionMode>;
export const DEFAULT_PROVIDER_INTERACTION_MODE = "default" as const;
export const ProviderRequestKind = forwardCompatibleLiteral([
  "command",
  "file-read",
  "file-change",
  "mcp-elicitation",
  "permission",
]);
export type ProviderRequestKind = z.infer<typeof ProviderRequestKind>;
export const ProviderApprovalDecision = forwardCompatibleLiteral([
  "accept",
  "acceptForSession",
  "acceptAlways",
  "decline",
  "cancel",
]);
export type ProviderApprovalDecision = z.infer<typeof ProviderApprovalDecision>;
export const ProviderApprovalOption = z.looseObject({
  decision: ProviderApprovalDecision,
  label: TrimmedNonEmptyString,
  warning: TrimmedNonEmptyString.optional(),
});
export type ProviderApprovalOption = z.infer<typeof ProviderApprovalOption>;

/**
 * One question's answer: any JSON value, as the contracts allow. The provider
 * adapters act on a single choice (a string), several choices (a string
 * array), or Codex's `{ answers: string[] }`.
 */
export const ProviderUserInputAnswer = JsonValue;
export type ProviderUserInputAnswer = z.infer<typeof ProviderUserInputAnswer>;
export const ProviderUserInputAnswers = stringRecord(ProviderUserInputAnswer);
export type ProviderUserInputAnswers = z.infer<typeof ProviderUserInputAnswers>;
export const UserInputAttachments = stringRecord(
  z
    .array(z.union([ChatImageAttachment, ChatFileAttachment]))
    .max(PROVIDER_SEND_TURN_MAX_ATTACHMENTS),
);
export type UserInputAttachments = z.infer<typeof UserInputAttachments>;
export const UserInputAttachmentAnswerPayload = z.looseObject({
  requestId: TrimmedNonEmptyString,
  questionTextById: stringRecord(z.string()).optional(),
  answers: ProviderUserInputAnswers,
  attachmentsByQuestionId: UserInputAttachments,
});
export type UserInputAttachmentAnswerPayload = z.infer<typeof UserInputAttachmentAnswerPayload>;

export const OrchestrationV2Actor = forwardCompatibleLiteral(["user", "agent", "system"]);
export type OrchestrationV2Actor = z.infer<typeof OrchestrationV2Actor>;
export const OrchestrationV2CreationSource = forwardCompatibleLiteral([
  "web",
  "mobile",
  "mcp",
  "provider",
  "server",
]);
export type OrchestrationV2CreationSource = z.infer<typeof OrchestrationV2CreationSource>;
/** Who created a thread or message and from which surface; stamped on every creation command. */
export const OrchestrationV2CreationFields = {
  createdBy: OrchestrationV2Actor,
  creationSource: OrchestrationV2CreationSource,
} as const;
export const OrchestrationV2ThreadHistoryOrigin = forwardCompatibleLiteral(["native", "v1_import"]);
export type OrchestrationV2ThreadHistoryOrigin = z.infer<typeof OrchestrationV2ThreadHistoryOrigin>;

export const OrchestrationV2NativeRefStrength = forwardCompatibleLiteral([
  "strong",
  "weak",
  "none",
]);
export type OrchestrationV2NativeRefStrength = z.infer<typeof OrchestrationV2NativeRefStrength>;
/** A provider-native identifier and how firmly it names the thing. */
export const OrchestrationV2ProviderRef = z.looseObject({
  driver: ProviderDriverKind,
  nativeId: TrimmedNonEmptyString.nullable(),
  strength: OrchestrationV2NativeRefStrength,
  fingerprint: TrimmedNonEmptyString.optional(),
  ordinal: NonNegativeInt.optional(),
});
export type OrchestrationV2ProviderRef = z.infer<typeof OrchestrationV2ProviderRef>;
