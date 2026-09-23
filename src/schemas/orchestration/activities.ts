// ---
// relationships:
//   implements: design
// ---
import { z } from "zod";
import {
  ApprovalRequestId,
  TrimmedNonEmptyString,
  forwardCompatibleArray,
  forwardCompatibleLiteral,
  forwardCompatibleRecord,
} from "../common.ts";
import { UserInputAttachments } from "./commands/attachments.ts";
import { ProviderApprovalDecision, ProviderRequestKind, ProviderUserInputAnswer } from "./model.ts";
import type { OrchestrationThreadActivity, ThreadActivityOfKind } from "./threadActivity.ts";

export const UserInputQuestionOption = z.looseObject({
  label: TrimmedNonEmptyString,
  description: z.string().optional(),
  value: z.string().optional(),
});
export type UserInputQuestionOption = z.infer<typeof UserInputQuestionOption>;
export const UserInputQuestion = z.looseObject({
  id: TrimmedNonEmptyString,
  question: TrimmedNonEmptyString,
  header: TrimmedNonEmptyString.optional(),
  multiSelect: z.boolean().default(false),
  allowCustomAnswer: z.boolean().optional(),
  options: z.array(UserInputQuestionOption),
});
export type UserInputQuestion = z.infer<typeof UserInputQuestion>;
export const ProviderApprovalOption = z.looseObject({
  decision: ProviderApprovalDecision,
  label: TrimmedNonEmptyString,
  warning: TrimmedNonEmptyString.optional(),
});
export type ProviderApprovalOption = z.infer<typeof ProviderApprovalOption>;
// Runtime ingestion copies the provider event's request id, which may be absent.
export const ApprovalRequestedPayload = z.looseObject({
  requestId: ApprovalRequestId.optional(),
  requestKind: ProviderRequestKind.optional(),
  requestType: z.string().optional(),
  detail: z.string().optional(),
  appName: z.string().optional(),
  options: z.array(ProviderApprovalOption).optional(),
});
export type ApprovalRequestedPayload = z.infer<typeof ApprovalRequestedPayload>;
export const ApprovalResolvedPayload = z.looseObject({
  requestId: ApprovalRequestId,
  requestKind: ProviderRequestKind.optional(),
  requestType: z.string().optional(),
  decision: ProviderApprovalDecision.optional(),
});
export type ApprovalResolvedPayload = z.infer<typeof ApprovalResolvedPayload>;
// Runtime ingestion can publish questions without a correlated request id.
export const UserInputRequestedPayload = z.looseObject({
  requestId: ApprovalRequestId.optional(),
  questions: forwardCompatibleArray(UserInputQuestion),
  responseMode: forwardCompatibleLiteral(["message"]).optional(),
});
export type UserInputRequestedPayload = z.infer<typeof UserInputRequestedPayload>;
export const UserInputResolvedPayload = z.looseObject({
  requestId: ApprovalRequestId.optional(),
  // Provider runtimes pass answers through; a value shape this client does not
  // know is dropped rather than failing the activity.
  answers: forwardCompatibleRecord(ProviderUserInputAnswer).optional(),
  responseMode: forwardCompatibleLiteral(["message"]).optional(),
  attachmentsByQuestionId: UserInputAttachments.optional(),
  dismissed: z.boolean().optional(),
});
export type UserInputResolvedPayload = z.infer<typeof UserInputResolvedPayload>;
export const ProviderApprovalRespondFailedPayload = z.looseObject({
  requestId: ApprovalRequestId,
  detail: z.string(),
});
export type ProviderApprovalRespondFailedPayload = z.infer<
  typeof ProviderApprovalRespondFailedPayload
>;
export const ProviderUserInputRespondFailedPayload = ProviderApprovalRespondFailedPayload;
export type ProviderUserInputRespondFailedPayload = z.infer<
  typeof ProviderUserInputRespondFailedPayload
>;

/** An activity that opens an approval or user-input request. */
export type RequestOpeningActivity =
  | ThreadActivityOfKind<"approval.requested">
  | ThreadActivityOfKind<"user-input.requested">;

const stalePhrases = [
  "stale pending approval request",
  "unknown pending approval request",
  "unknown pending permission request",
  "stale pending user-input request",
  "unknown pending user-input request",
  "unknown pending user input request",
  "unknown pending codex user input request",
];

/** Mirror the decider: activity order matters; transient failures keep requests open. */
export function openRequests(
  activities: readonly OrchestrationThreadActivity[],
): Map<ApprovalRequestId, RequestOpeningActivity> {
  const requests = new Map<ApprovalRequestId, RequestOpeningActivity>();
  for (const activity of activities) {
    if (activity.unknown) continue;
    switch (activity.kind) {
      case "approval.requested":
      case "user-input.requested":
        if (activity.payload.requestId !== undefined) {
          requests.set(activity.payload.requestId, activity);
        }
        break;
      case "approval.resolved":
      case "user-input.resolved":
        if (activity.payload.requestId !== undefined) requests.delete(activity.payload.requestId);
        break;
      case "provider.approval.respond.failed":
      case "provider.user-input.respond.failed": {
        const detail = activity.payload.detail.toLowerCase();
        if (stalePhrases.some((phrase) => detail.includes(phrase))) {
          requests.delete(activity.payload.requestId);
        }
        break;
      }
    }
  }
  return requests;
}
