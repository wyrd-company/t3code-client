// ---
// relationships:
//   implements: design
// ---
import { z } from "zod";
import {
  ProjectCreateCommand,
  ProjectDeleteCommand,
  ProjectMetaUpdateCommand,
} from "./commands/project.ts";
import {
  ThreadActiveReorderCommand,
  ThreadArchiveCommand,
  ThreadCreateCommand,
  ThreadDeleteCommand,
  ThreadInteractionModeSetCommand,
  ThreadMetaUpdateCommand,
  ThreadPinCommand,
  ThreadPinReorderCommand,
  ThreadPullRequestLinkCommand,
  ThreadPullRequestUnlinkCommand,
  ThreadRuntimeModeSetCommand,
  ThreadSettleCommand,
  ThreadSnoozeCommand,
  ThreadUnarchiveCommand,
  ThreadUnpinCommand,
  ThreadUnsettleCommand,
  ThreadUnsnoozeCommand,
} from "./commands/thread.ts";
import {
  ClientThreadTurnStartCommand,
  ThreadApprovalRespondCommand,
  ThreadCheckpointRevertCommand,
  ThreadConversationRevertCommand,
  ThreadSessionStopCommand,
  ThreadTurnInterruptCommand,
  ThreadUserInputDismissCommand,
  ThreadUserInputRespondCommand,
} from "./commands/turn.ts";

export const ClientOrchestrationCommand = z.union([
  ProjectCreateCommand,
  ProjectMetaUpdateCommand,
  ProjectDeleteCommand,
  ThreadCreateCommand,
  ThreadDeleteCommand,
  ThreadArchiveCommand,
  ThreadUnarchiveCommand,
  ThreadSettleCommand,
  ThreadUnsettleCommand,
  ThreadSnoozeCommand,
  ThreadUnsnoozeCommand,
  ThreadPinCommand,
  ThreadUnpinCommand,
  ThreadPinReorderCommand,
  ThreadActiveReorderCommand,
  ThreadMetaUpdateCommand,
  ThreadPullRequestLinkCommand,
  ThreadPullRequestUnlinkCommand,
  ThreadRuntimeModeSetCommand,
  ThreadInteractionModeSetCommand,
  ClientThreadTurnStartCommand,
  ThreadTurnInterruptCommand,
  ThreadApprovalRespondCommand,
  ThreadUserInputRespondCommand,
  ThreadUserInputDismissCommand,
  ThreadCheckpointRevertCommand,
  ThreadConversationRevertCommand,
  ThreadSessionStopCommand,
]);
export type ClientOrchestrationCommand = z.infer<typeof ClientOrchestrationCommand>;

export * from "./commands/project.ts";
export * from "./commands/thread.ts";
export * from "./commands/turn.ts";
export * from "./commands/attachments.ts";
