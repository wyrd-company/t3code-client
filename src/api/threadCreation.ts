/**
 * Thread creation inputs and the wire payloads `threads.create` and
 * `threads.launch` send, with server bookkeeping filled in.
 */
import type { ProjectId, ThreadId } from "../schemas/common.ts";
import type { OrchestrationV2Command } from "../schemas/orchestration/commands.ts";
import type { ChatAttachment } from "../schemas/orchestration/attachments.ts";
import type { OrchestrationMessageContext } from "../schemas/orchestration/messageContext.ts";
import type {
  ModelSelection,
  ProviderInteractionMode,
  RuntimeMode,
} from "../schemas/orchestration/model.ts";
import type { OrchestrationV2ThreadLaunchWorkspaceStrategy } from "../schemas/orchestration/runs.ts";
import type { OrchestrationV2ThreadLaunchInput } from "../schemas/orchestration/stream.ts";
import type { CommandDispatcher } from "./dispatch.ts";
import { creationFields } from "./threadTurnStart.ts";
import type { CreationOrigin } from "./turns.ts";

export interface ThreadCreateInput {
  readonly threadId?: ThreadId;
  readonly projectId: ProjectId;
  readonly title: string;
  readonly modelSelection: ModelSelection;
  /** Defaults to "full-access", the server's default. */
  readonly runtimeMode?: RuntimeMode;
  readonly interactionMode?: ProviderInteractionMode;
  readonly branch?: string | null;
  readonly worktreePath?: string | null;
  readonly origin?: CreationOrigin;
}

/** `threads.launch`: create (or reuse) a thread, prepare its workspace, and optionally send a first message. */
export interface ThreadLaunchInput {
  readonly threadId?: ThreadId;
  /** Return the existing thread for `threadId` instead of failing. */
  readonly reuseExistingThread?: boolean;
  readonly projectId: ProjectId;
  readonly title: string;
  readonly generateTitle?: boolean;
  readonly modelSelection: ModelSelection;
  readonly runtimeMode?: RuntimeMode;
  readonly interactionMode?: ProviderInteractionMode;
  /** `root`, an existing worktree, or a new worktree from a base ref. */
  readonly workspace: OrchestrationV2ThreadLaunchWorkspaceStrategy;
  readonly initialMessage?: {
    readonly text: string;
    readonly context?: OrchestrationMessageContext;
    readonly attachments?: ChatAttachment[];
  };
  readonly creationSource?: OrchestrationV2ThreadLaunchInput["creationSource"];
}

type IdSource = Pick<CommandDispatcher, "newCommandId" | "newMessageId">;

export function threadCreateCommand(
  ids: IdSource,
  threadId: ThreadId,
  input: ThreadCreateInput,
): Extract<OrchestrationV2Command, { type: "thread.create" }> {
  return {
    type: "thread.create",
    ...creationFields(input.origin),
    commandId: ids.newCommandId(),
    threadId,
    projectId: input.projectId,
    title: input.title,
    modelSelection: input.modelSelection,
    runtimeMode: input.runtimeMode ?? "full-access",
    interactionMode: input.interactionMode ?? "default",
    branch: input.branch ?? null,
    worktreePath: input.worktreePath ?? null,
  };
}

export function threadLaunchPayload(
  ids: IdSource,
  input: ThreadLaunchInput,
): OrchestrationV2ThreadLaunchInput {
  const { workspace, initialMessage, runtimeMode, interactionMode, ...rest } = input;
  return {
    ...rest,
    commandId: ids.newCommandId(),
    runtimeMode: runtimeMode ?? "full-access",
    interactionMode: interactionMode ?? "default",
    workspaceStrategy: workspace,
    ...(initialMessage === undefined
      ? {}
      : {
          initialMessage: {
            messageId: ids.newMessageId(),
            text: initialMessage.text,
            ...(initialMessage.context === undefined ? {} : { context: initialMessage.context }),
            attachments: initialMessage.attachments ?? [],
          },
        }),
  };
}
