/**
 * Builders for the thread commands ThreadsApi dispatches. Each fills the
 * server bookkeeping (`commandId`) from the dispatcher so the facade methods
 * stay one line each.
 */
import type { RunId, RuntimeRequestId, ThreadId } from "../schemas/common.ts";
import type { OrchestrationV2Command } from "../schemas/orchestration/commands.ts";
import type { RuntimeRequestRespondCommand } from "../schemas/orchestration/commands/message.ts";
import type {
  ModelSelection,
  ProviderInteractionMode,
  RuntimeMode,
} from "../schemas/orchestration/model.ts";
import type { CommandDispatcher } from "./dispatch.ts";

export interface ApprovalResponseInput {
  readonly threadId: ThreadId;
  readonly requestId: RuntimeRequestId;
  readonly decision: NonNullable<RuntimeRequestRespondCommand["decision"]>;
}

export interface UserInputResponseInput {
  readonly threadId: ThreadId;
  readonly requestId: RuntimeRequestId;
  readonly answers: NonNullable<RuntimeRequestRespondCommand["answers"]>;
  readonly attachmentsByQuestionId?: RuntimeRequestRespondCommand["attachmentsByQuestionId"];
}

export interface UserInputDismissInput {
  readonly threadId: ThreadId;
  readonly requestId: RuntimeRequestId;
}

export interface InterruptOptions {
  readonly reason?: string;
  /** The Stop button: also hold the queue, end pull request watches, and stop delegated tasks. */
  readonly holdQueue?: boolean;
}

export class ThreadCommands {
  readonly dispatcher: CommandDispatcher;

  constructor(dispatcher: CommandDispatcher) {
    this.dispatcher = dispatcher;
  }

  simple(
    type:
      | "thread.archive"
      | "thread.unarchive"
      | "thread.delete"
      | "thread.unpin"
      | "thread.mark-unread"
      | "queue.resume",
    threadId: ThreadId,
  ): OrchestrationV2Command {
    return { type, commandId: this.dispatcher.newCommandId(), threadId };
  }

  settle(threadId: ThreadId): OrchestrationV2Command {
    return { type: "thread.settle", commandId: this.dispatcher.newCommandId(), threadId };
  }

  unsettle(threadId: ThreadId): OrchestrationV2Command {
    return {
      type: "thread.unsettle",
      commandId: this.dispatcher.newCommandId(),
      threadId,
      reason: "user",
    };
  }

  setRuntimeMode(threadId: ThreadId, runtimeMode: RuntimeMode): OrchestrationV2Command {
    return {
      type: "thread.runtime-mode.set",
      commandId: this.dispatcher.newCommandId(),
      threadId,
      runtimeMode,
    };
  }

  setInteractionMode(
    threadId: ThreadId,
    interactionMode: ProviderInteractionMode,
  ): OrchestrationV2Command {
    return {
      type: "thread.interaction-mode.set",
      commandId: this.dispatcher.newCommandId(),
      threadId,
      interactionMode,
    };
  }

  setModelSelection(threadId: ThreadId, modelSelection: ModelSelection): OrchestrationV2Command {
    return {
      type: "thread.model-selection.set",
      commandId: this.dispatcher.newCommandId(),
      threadId,
      modelSelection,
    };
  }

  interrupt(
    threadId: ThreadId,
    runId: RunId,
    options: InterruptOptions = {},
  ): OrchestrationV2Command {
    return {
      type: "run.interrupt",
      commandId: this.dispatcher.newCommandId(),
      threadId,
      runId,
      ...(options.reason === undefined ? {} : { reason: options.reason }),
      ...(options.holdQueue === undefined ? {} : { holdQueue: options.holdQueue }),
    };
  }

  respondToApproval(input: ApprovalResponseInput): OrchestrationV2Command {
    return {
      type: "runtime-request.respond",
      commandId: this.dispatcher.newCommandId(),
      threadId: input.threadId,
      requestId: input.requestId,
      decision: input.decision,
    };
  }

  respondToUserInput(input: UserInputResponseInput): OrchestrationV2Command {
    return {
      type: "runtime-request.respond",
      commandId: this.dispatcher.newCommandId(),
      threadId: input.threadId,
      requestId: input.requestId,
      answers: input.answers,
      ...(input.attachmentsByQuestionId === undefined
        ? {}
        : { attachmentsByQuestionId: input.attachmentsByQuestionId }),
    };
  }

  dismissUserInput(input: UserInputDismissInput): OrchestrationV2Command {
    return {
      type: "thread.user-input.dismiss",
      commandId: this.dispatcher.newCommandId(),
      threadId: input.threadId,
      requestId: input.requestId,
    };
  }
}
