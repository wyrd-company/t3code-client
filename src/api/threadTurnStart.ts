/**
 * `threads.startTurn`: set the thread's modes when the caller names them,
 * dispatch `message.dispatch`, and hand back a TurnHandle that follows the
 * run from the dispatch receipt.
 */
import type { MessageId } from "../schemas/common.ts";
import type { MessageDispatchCommand } from "../schemas/orchestration/commands/message.ts";
import {
  createTurnHandle,
  type CreationOrigin,
  type StartTurnInput,
  type TurnDelivery,
  type TurnDependencies,
  type TurnHandle,
} from "./turns.ts";

export interface TurnStartDependencies extends TurnDependencies {
  newMessageId(): MessageId;
}

/** The `createdBy` and `creationSource` stamp a command carries; `user` from `web` by default. */
export function creationFields(origin: CreationOrigin | undefined): {
  readonly createdBy: MessageDispatchCommand["createdBy"];
  readonly creationSource: MessageDispatchCommand["creationSource"];
} {
  return {
    createdBy: origin?.createdBy ?? "user",
    creationSource: origin?.creationSource ?? "web",
  };
}

/** How a delivery choice is said on the wire: a requested mode plus, for the server-resolved ones, an intent. */
export function deliveryFields(
  delivery: TurnDelivery,
): Pick<MessageDispatchCommand, "dispatchMode" | "deliveryIntent"> {
  switch (delivery) {
    case "queue":
      return { dispatchMode: { type: "queue_after_active" } };
    case "start":
      return { dispatchMode: { type: "start_immediately" } };
    default:
      return { dispatchMode: { type: "start_immediately" }, deliveryIntent: delivery };
  }
}

export async function startThreadTurn(
  deps: TurnStartDependencies,
  input: StartTurnInput,
): Promise<TurnHandle> {
  const { signal, threadId } = input;
  if (input.runtimeMode !== undefined) {
    await deps.dispatch(
      {
        type: "thread.runtime-mode.set",
        commandId: deps.newCommandId(),
        threadId,
        runtimeMode: input.runtimeMode,
      },
      signal,
    );
  }
  if (input.interactionMode !== undefined) {
    await deps.dispatch(
      {
        type: "thread.interaction-mode.set",
        commandId: deps.newCommandId(),
        threadId,
        interactionMode: input.interactionMode,
      },
      signal,
    );
  }
  const commandId = deps.newCommandId();
  const messageId = deps.newMessageId();
  const receipt = await deps.dispatch(
    {
      type: "message.dispatch",
      ...creationFields(input.origin),
      commandId,
      threadId,
      messageId,
      text: input.text,
      attachments: input.attachments ?? [],
      ...(input.context === undefined ? {} : { context: input.context }),
      ...(input.modelSelection === undefined ? {} : { modelSelection: input.modelSelection }),
      ...(input.titleSeed === undefined ? {} : { titleSeed: input.titleSeed }),
      ...deliveryFields(input.delivery ?? "auto"),
    },
    signal,
  );
  return createTurnHandle(deps, {
    threadId,
    messageId,
    commandId,
    sequence: receipt.sequence,
    ...(signal === undefined ? {} : { signal }),
  });
}
