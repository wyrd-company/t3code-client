/**
 * `threads.startTurn`: resolve the thread's current modes when the caller
 * omits them, dispatch `thread.turn.start`, and hand back a TurnHandle that
 * follows the turn from the dispatch receipt.
 */
import { T3PreconditionError } from "../errors.ts";
import type { MessageId, ThreadId } from "../schemas/common.ts";
import type { ThreadCreateCommand } from "../schemas/orchestration/commands/thread.ts";
import type { OrchestrationThreadShell } from "../schemas/orchestration/shell.ts";
import {
  createTurnHandle,
  type StartTurnInput,
  type TurnDependencies,
  type TurnHandle,
} from "./turns.ts";

export interface TurnStartDependencies extends TurnDependencies {
  get(threadId: ThreadId, signal?: AbortSignal): Promise<OrchestrationThreadShell | undefined>;
  newMessageId(): MessageId;
}

/** Modes default to the thread's current modes (one shell read when omitted). */
export async function startThreadTurn(
  deps: TurnStartDependencies,
  input: StartTurnInput,
): Promise<TurnHandle> {
  const { signal } = input;
  let runtimeMode = input.runtimeMode;
  let interactionMode = input.interactionMode;
  if (runtimeMode === undefined || interactionMode === undefined) {
    const thread = await deps.get(input.threadId, signal);
    if (!thread) throw new T3PreconditionError(`Thread ${input.threadId} does not exist.`);
    runtimeMode ??= asRuntimeMode(thread.runtimeMode);
    interactionMode ??= thread.interactionMode === "plan" ? "plan" : "default";
  }
  const commandId = deps.newCommandId();
  const messageId = deps.newMessageId();
  const createdAt = deps.now();
  const receipt = await deps.dispatch(
    {
      type: "thread.turn.start",
      commandId,
      threadId: input.threadId,
      message: {
        messageId,
        role: "user",
        text: input.text,
        attachments: input.attachments ?? [],
        ...(input.context === undefined ? {} : { context: input.context }),
      },
      ...(input.modelSelection === undefined ? {} : { modelSelection: input.modelSelection }),
      ...(input.titleSeed === undefined ? {} : { titleSeed: input.titleSeed }),
      runtimeMode,
      interactionMode,
      ...(input.bootstrap === undefined ? {} : { bootstrap: input.bootstrap }),
      createdAt,
    },
    signal,
  );
  return createTurnHandle(deps, {
    threadId: input.threadId,
    messageId,
    commandId,
    createdAt,
    sequence: receipt.sequence,
    reasoningMessages: input.reasoningMessages === true,
    ...(signal === undefined ? {} : { signal }),
  });
}

const runtimeModes = ["approval-required", "auto-accept-edits", "auto", "full-access"] as const;

function asRuntimeMode(mode: string): ThreadCreateCommand["runtimeMode"] {
  const known = runtimeModes.find((candidate) => candidate === mode);
  return known ?? "full-access";
}
