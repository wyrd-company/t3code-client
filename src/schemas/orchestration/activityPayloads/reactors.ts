/**
 * Payloads of the activities the server's reactors, decider, and setup-script
 * runner record, in the shape clients receive them. None of these payloads
 * carries a `data` record, so the server's activity payload projection sends
 * them unchanged.
 */
import { z } from "zod";
import {
  ApprovalRequestId,
  MessageId,
  NonNegativeInt,
  ProviderInstanceId,
  TrimmedNonEmptyString,
  forwardCompatibleLiteral,
} from "../../common.ts";
import { WorktreeSetupSnapshot } from "../../worktreeSetup.ts";
import { UserInputAttachments } from "../commands/attachments.ts";
import { ProviderUserInputAnswers } from "../model.ts";

// CheckpointReactor

export const CheckpointCaptureFailedActivityPayload = z.looseObject({
  detail: z.string(),
});
export type CheckpointCaptureFailedActivityPayload = z.infer<
  typeof CheckpointCaptureFailedActivityPayload
>;

/** Mirrors the reactor's checkpoint status. Declared here to keep this module free of `readModel.ts`. */
const CapturedCheckpointStatus = forwardCompatibleLiteral(["ready", "missing", "error"]);

export const CheckpointCapturedActivityPayload = z.looseObject({
  turnCount: NonNegativeInt,
  status: CapturedCheckpointStatus,
});
export type CheckpointCapturedActivityPayload = z.infer<typeof CheckpointCapturedActivityPayload>;

export const CheckpointRevertFailedActivityPayload = z.looseObject({
  turnCount: NonNegativeInt,
  detail: z.string(),
});
export type CheckpointRevertFailedActivityPayload = z.infer<
  typeof CheckpointRevertFailedActivityPayload
>;

// ProviderCommandReactor

export const ProviderAuthSignedOutActivityPayload = z.looseObject({
  providerInstanceId: ProviderInstanceId,
});
export type ProviderAuthSignedOutActivityPayload = z.infer<
  typeof ProviderAuthSignedOutActivityPayload
>;

export const ProviderSessionStopFailedActivityPayload = z.looseObject({
  detail: z.string(),
});
export type ProviderSessionStopFailedActivityPayload = z.infer<
  typeof ProviderSessionStopFailedActivityPayload
>;

export const ProviderTurnInterruptFailedActivityPayload = z.looseObject({
  detail: z.string(),
});
export type ProviderTurnInterruptFailedActivityPayload = z.infer<
  typeof ProviderTurnInterruptFailedActivityPayload
>;

export const ProviderTurnStartFailedActivityPayload = z.looseObject({
  detail: z.string(),
  /** The id of the user message whose turn did not start. The server names it `requestId`. */
  requestId: MessageId.optional(),
});
export type ProviderTurnStartFailedActivityPayload = z.infer<
  typeof ProviderTurnStartFailedActivityPayload
>;

// decider

/**
 * Recorded when a question is answered with attached files. Mirrors the
 * contracts' `UserInputAttachmentAnswerPayload` plus the `detail` the decider
 * adds: the attachment names, one per line.
 */
export const UserInputAnswerSubmittedActivityPayload = z.looseObject({
  requestId: ApprovalRequestId,
  questionTextById: z.record(z.string(), z.string()).optional(),
  answers: ProviderUserInputAnswers,
  attachmentsByQuestionId: UserInputAttachments,
  detail: z.string().optional(),
});
export type UserInputAnswerSubmittedActivityPayload = z.infer<
  typeof UserInputAnswerSubmittedActivityPayload
>;

// ws.ts setup-script runner and worktree setup

export const SetupScriptLaunchActivityPayload = z.looseObject({
  scriptId: TrimmedNonEmptyString,
  scriptName: z.string(),
  terminalId: TrimmedNonEmptyString,
  worktreePath: TrimmedNonEmptyString,
});
export type SetupScriptLaunchActivityPayload = z.infer<typeof SetupScriptLaunchActivityPayload>;

export const SetupScriptRequestedActivityPayload = SetupScriptLaunchActivityPayload;
export type SetupScriptRequestedActivityPayload = SetupScriptLaunchActivityPayload;
export const SetupScriptStartedActivityPayload = SetupScriptLaunchActivityPayload;
export type SetupScriptStartedActivityPayload = SetupScriptLaunchActivityPayload;

export const SetupScriptFailedActivityPayload = z.looseObject({
  detail: z.string(),
  worktreePath: TrimmedNonEmptyString,
});
export type SetupScriptFailedActivityPayload = z.infer<typeof SetupScriptFailedActivityPayload>;

/**
 * The durable record of a thread's worktree setup: one activity per thread,
 * upserted under a fixed id as the setup progresses. The payload is the
 * setup snapshot itself.
 */
export const WorktreeSetupActivityPayload = WorktreeSetupSnapshot;
export type WorktreeSetupActivityPayload = WorktreeSetupSnapshot;

export const reactorActivityPayloads = {
  "checkpoint.capture.failed": CheckpointCaptureFailedActivityPayload,
  "checkpoint.captured": CheckpointCapturedActivityPayload,
  "checkpoint.revert.failed": CheckpointRevertFailedActivityPayload,
  "provider.auth.signed-out": ProviderAuthSignedOutActivityPayload,
  "provider.session.stop.failed": ProviderSessionStopFailedActivityPayload,
  "provider.turn.interrupt.failed": ProviderTurnInterruptFailedActivityPayload,
  "provider.turn.start.failed": ProviderTurnStartFailedActivityPayload,
  "user-input.answer-submitted": UserInputAnswerSubmittedActivityPayload,
  "setup-script.requested": SetupScriptRequestedActivityPayload,
  "setup-script.started": SetupScriptStartedActivityPayload,
  "setup-script.failed": SetupScriptFailedActivityPayload,
  "worktree-setup": WorktreeSetupActivityPayload,
} as const satisfies Record<string, z.ZodType>;
