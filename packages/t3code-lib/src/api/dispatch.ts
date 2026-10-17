// ---
// relationships:
//   implements: library
// ---
/**
 * CommandDispatcher: the one path every facade uses to send an orchestration
 * command. It validates the command against `OrchestrationV2Command` and
 * sends it over the socket, which answers with the typed
 * `OrchestrationV2DispatchCommandError`. It also mints the bookkeeping ids
 * and timestamps commands need.
 */
import { T3PreconditionError, T3RpcError } from "../errors.ts";
import { nowIso, systemClock, type Clock } from "../internal/clock.ts";
import { newId } from "../internal/ids.ts";
import type { RpcClient } from "../rpc/client.ts";
import type { RpcMethods } from "../rpc/registry.ts";
import {
  commandId,
  messageId,
  projectId,
  threadId,
  type CommandId,
  type MessageId,
  type ProjectId,
  type ThreadId,
} from "../schemas/common.ts";
import { OrchestrationV2Command } from "../schemas/orchestration/commands.ts";
import type { DispatchResult } from "../schemas/orchestration/stream.ts";

export interface CommandDispatcherOptions {
  readonly clock?: Clock;
  readonly ids?: () => string;
}

/** Validated orchestration dispatch and bookkeeping ids. */
export class CommandDispatcher {
  readonly #rpc: RpcClient<RpcMethods>;
  readonly #clock: Clock;
  readonly #ids: () => string;

  constructor(rpc: RpcClient<RpcMethods>, options: CommandDispatcherOptions = {}) {
    this.#rpc = rpc;
    this.#clock = options.clock ?? systemClock;
    this.#ids = options.ids ?? newId;
  }

  /** Command ids are attempt ids on the server, never idempotency keys: one per dispatch. */
  newCommandId(): CommandId {
    return commandId(this.#ids());
  }

  /** Generate a message id. */
  newMessageId(): MessageId {
    return messageId(this.#ids());
  }

  /** Generate a thread id. */
  newThreadId(): ThreadId {
    return threadId(this.#ids());
  }

  /** Generate a project id. */
  newProjectId(): ProjectId {
    return projectId(this.#ids());
  }

  /** Return the current timestamp in ISO format. */
  now(): string {
    return nowIso(this.#clock);
  }

  /** Validate and dispatch one orchestration command. */
  async dispatch(command: OrchestrationV2Command, signal?: AbortSignal): Promise<DispatchResult> {
    const parsed = OrchestrationV2Command.safeParse(command);
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      const field = issue?.path.map(String).join(".") || "command";
      throw new T3PreconditionError(
        `${command.type} is invalid: ${field}: ${issue?.message ?? "invalid value"}`,
        { cause: parsed.error },
      );
    }
    return this.#rpc.call("orchestration.dispatchCommand", parsed.data, signal);
  }
}

/** How the server words a missing thread or project across its layers. */
const missingResource =
  /\bwas not found\b|\bdoes not exist\b|\bnot found\b|\bno orchestration projection exists\b/i;

/** `true` when the server rejected a command or mutation because its thread or project does not exist. */
export function isMissingResourceError(error: unknown): boolean {
  if (!(error instanceof T3RpcError)) return false;
  if (error.is("OrchestrationV2DispatchCommandError")) {
    const { message, detail, cause } = error.record;
    return (
      missingResource.test(message) ||
      (detail !== undefined && missingResource.test(detail)) ||
      mentionsMissingResource(cause)
    );
  }
  if (error.is("ProjectMutationError")) {
    return (
      missingResource.test(error.record.message) || mentionsMissingResource(error.record.cause)
    );
  }
  return false;
}

function mentionsMissingResource(cause: unknown): boolean {
  if (cause === undefined || cause === null) return false;
  try {
    const text = typeof cause === "string" ? cause : JSON.stringify(cause);
    return /NotFoundError|was not found|does not exist/.test(text);
  } catch {
    return false;
  }
}
