// ---
// relationships:
//   implements: library
// ---
/** Thread lifecycle and setting commands of `OrchestrationV2Command`. */
import { z } from "zod";
import {
  CommandId,
  IsoDateTime,
  ProjectId,
  ProviderDriverKind,
  ProviderSessionId,
  ThreadId,
  TrimmedNonEmptyString,
} from "../../common.ts";
import {
  ModelSelection,
  OrchestrationV2CreationFields,
  ProviderInteractionMode,
  RuntimeMode,
} from "../model.ts";
import { OrchestrationV2ProviderThreadNativeMetadata } from "../providerState.ts";
import { ThreadLinkedPullRequest } from "../pullRequest.ts";
import { OrchestrationV2LimitRecoveryUpdate } from "../thread.ts";

const stamped = { commandId: CommandId, threadId: ThreadId } as const;

export const ThreadCreateCommand = z.looseObject({
  type: z.literal("thread.create"),
  ...OrchestrationV2CreationFields,
  ...stamped,
  projectId: ProjectId,
  title: TrimmedNonEmptyString,
  modelSelection: ModelSelection,
  runtimeMode: RuntimeMode,
  interactionMode: ProviderInteractionMode,
  branch: TrimmedNonEmptyString.nullable(),
  worktreePath: TrimmedNonEmptyString.nullable(),
  importedNativeThread: z
    .looseObject({
      ref: z.looseObject({
        driver: ProviderDriverKind,
        nativeId: TrimmedNonEmptyString,
        strength: z.literal("strong"),
      }),
      metadata: OrchestrationV2ProviderThreadNativeMetadata.optional(),
    })
    .optional(),
});
export type ThreadCreateCommand = z.infer<typeof ThreadCreateCommand>;

const simple = <T extends string>(type: T) => z.looseObject({ type: z.literal(type), ...stamped });
export const ThreadArchiveCommand = simple("thread.archive");
export const ThreadUnarchiveCommand = simple("thread.unarchive");
export const ThreadDeleteCommand = simple("thread.delete");
export const ThreadUnpinCommand = simple("thread.unpin");
export const ThreadMarkUnreadCommand = simple("thread.mark-unread");
export const ThreadSettleCommand = z.looseObject({
  type: z.literal("thread.settle"),
  ...stamped,
  settledAt: IsoDateTime.optional(),
});
/** Server-internal settlement by the sweep; listed because the union carries it. */
export const ThreadAutoSettleCommand = z.looseObject({
  type: z.literal("thread.auto-settle"),
  ...stamped,
  snapshotAt: IsoDateTime,
  settledAt: IsoDateTime.optional(),
});
export const ThreadUnsettleCommand = z.looseObject({
  type: z.literal("thread.unsettle"),
  ...stamped,
  reason: z.literal("user"),
});
export const ThreadSnoozeCommand = z.looseObject({
  type: z.literal("thread.snooze"),
  ...stamped,
  snoozedUntil: IsoDateTime,
});
export const ThreadUnsnoozeCommand = z.looseObject({
  type: z.literal("thread.unsnooze"),
  ...stamped,
  reason: z.literal("user"),
});
export const ThreadAutoSettleSetCommand = z.looseObject({
  type: z.literal("thread.auto-settle.set"),
  ...stamped,
  enabled: z.boolean(),
});
export const ThreadPinCommand = z.looseObject({
  type: z.literal("thread.pin"),
  ...stamped,
  orderKey: TrimmedNonEmptyString.optional(),
});
export const ThreadPinReorderCommand = z.looseObject({
  type: z.literal("thread.pin.reorder"),
  ...stamped,
  orderKey: TrimmedNonEmptyString,
});
export const ThreadActiveReorderCommand = z.looseObject({
  type: z.literal("thread.active.reorder"),
  ...stamped,
  orderKey: TrimmedNonEmptyString,
});
export const ThreadVisitCommand = z.looseObject({
  type: z.literal("thread.visit"),
  ...stamped,
  /** Watermark of the thread state the viewer has seen; the server keeps the maximum. */
  visitedAt: IsoDateTime,
});
/** The fields of `thread.metadata.update` a caller chooses; absent fields leave the thread unchanged. */
export const ThreadMetadataUpdatePayload = z.looseObject({
  title: TrimmedNonEmptyString.optional(),
  /** Kick off (true) or abandon (false) an async title regeneration. */
  regenerateTitle: z.boolean().optional(),
  branch: TrimmedNonEmptyString.nullable().optional(),
  worktreePath: TrimmedNonEmptyString.nullable().optional(),
  expectedWorktreePath: TrimmedNonEmptyString.nullable().optional(),
  /** Reject unless no message or run has landed on this thread. */
  expectedEmpty: z.boolean().optional(),
  limitRecovery: OrchestrationV2LimitRecoveryUpdate.nullable().optional(),
  /** Link (object) or unlink (null) a pull request; absent leaves it unchanged. */
  linkedPullRequest: ThreadLinkedPullRequest.nullable().optional(),
});
export type ThreadMetadataUpdatePayload = z.infer<typeof ThreadMetadataUpdatePayload>;
export const ThreadMetadataUpdateCommand = z.looseObject({
  type: z.literal("thread.metadata.update"),
  ...stamped,
  ...ThreadMetadataUpdatePayload.shape,
});
export type ThreadMetadataUpdateCommand = z.infer<typeof ThreadMetadataUpdateCommand>;
export const ThreadTitleRegenerationCompleteCommand = z.looseObject({
  type: z.literal("thread.title.regeneration.complete"),
  ...stamped,
  requestId: CommandId,
  title: TrimmedNonEmptyString.optional(),
});
export const ThreadRuntimeModeSetCommand = z.looseObject({
  type: z.literal("thread.runtime-mode.set"),
  ...stamped,
  runtimeMode: RuntimeMode,
});
export const ThreadInteractionModeSetCommand = z.looseObject({
  type: z.literal("thread.interaction-mode.set"),
  ...stamped,
  interactionMode: ProviderInteractionMode,
});
export const ThreadModelSelectionSetCommand = z.looseObject({
  type: z.literal("thread.model-selection.set"),
  ...stamped,
  modelSelection: ModelSelection,
});
export const ProviderSwitchCommand = z.looseObject({
  type: z.literal("provider.switch"),
  ...stamped,
  modelSelection: ModelSelection,
});
export const ProviderSessionDetachCommand = z.looseObject({
  type: z.literal("provider-session.detach"),
  ...stamped,
  providerSessionId: ProviderSessionId,
  reason: z.string().optional(),
});

export const threadCommandMembers = [
  ThreadCreateCommand,
  ThreadArchiveCommand,
  ThreadUnarchiveCommand,
  ThreadDeleteCommand,
  ThreadSettleCommand,
  ThreadAutoSettleCommand,
  ThreadUnsettleCommand,
  ThreadSnoozeCommand,
  ThreadUnsnoozeCommand,
  ThreadAutoSettleSetCommand,
  ThreadPinCommand,
  ThreadUnpinCommand,
  ThreadPinReorderCommand,
  ThreadActiveReorderCommand,
  ThreadVisitCommand,
  ThreadMarkUnreadCommand,
  ThreadMetadataUpdateCommand,
  ThreadTitleRegenerationCompleteCommand,
  ThreadRuntimeModeSetCommand,
  ThreadInteractionModeSetCommand,
  ThreadModelSelectionSetCommand,
  ProviderSwitchCommand,
  ProviderSessionDetachCommand,
] as const;
