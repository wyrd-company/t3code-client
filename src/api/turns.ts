/**
 * startTurn and TurnHandle: dispatch `message.dispatch`, then follow the
 * thread from the dispatch receipt until the run that took our message
 * settles. A turn in this library is one V2 run. `events()` and `completion`
 * share one background watch that starts lazily when `completion` is first
 * read or `events()` is first iterated. Which run is ours is decided by
 * `TurnAdoption`.
 */
import { T3ConnectionError, T3Error, T3InterruptedError } from "../errors.ts";
import { createChannel, type Channel } from "../internal/asyncIterable.ts";
import type { CommandId, MessageId, RunId, ThreadId } from "../schemas/common.ts";
import type { OrchestrationV2Command } from "../schemas/orchestration/commands.ts";
import type { MessageDispatchCommand } from "../schemas/orchestration/commands/message.ts";
import type {
  ModelSelection,
  OrchestrationV2Actor,
  OrchestrationV2CreationSource,
  ProviderInteractionMode,
  RuntimeMode,
} from "../schemas/orchestration/model.ts";
import type { DispatchResult } from "../schemas/orchestration/stream.ts";
import type { TurnOutcome } from "./threadProjection.ts";
import type { ThreadWatchItem, ThreadWatchOptions } from "./threadWatch.ts";
import { TurnAdoption } from "./turnAdoption.ts";

export type { TurnOutcome } from "./threadProjection.ts";

/** Who a thread or message is created by, and from which surface. Defaults: `user` from `web`. */
export interface CreationOrigin {
  readonly createdBy?: OrchestrationV2Actor;
  readonly creationSource?: OrchestrationV2CreationSource;
}

/**
 * How the message reaches a thread that is already busy. `auto` lets the
 * server steer or queue by the provider's capabilities; `steer` and `restart`
 * target the active run; `queue` waits behind it; `start` insists on a new
 * run now.
 */
export type TurnDelivery = "auto" | "steer" | "restart" | "queue" | "start";

export interface StartTurnInput {
  readonly threadId: ThreadId;
  readonly text: string;
  readonly attachments?: MessageDispatchCommand["attachments"];
  readonly context?: MessageDispatchCommand["context"];
  /** Model for this run; the thread's model otherwise. */
  readonly modelSelection?: ModelSelection;
  /** Sets the thread's mode before the message is sent. */
  readonly runtimeMode?: RuntimeMode;
  /** Sets the thread's mode before the message is sent. */
  readonly interactionMode?: ProviderInteractionMode;
  readonly titleSeed?: string;
  /** Defaults to `auto`. */
  readonly delivery?: TurnDelivery;
  readonly origin?: CreationOrigin;
  readonly signal?: AbortSignal;
}

export interface TurnHandle {
  readonly threadId: ThreadId;
  readonly messageId: MessageId;
  readonly commandId: CommandId;
  /** The dispatch receipt: the sequence of the last event the command produced. */
  readonly sequence: number;
  /** The run that took the message, once the server has linked them. */
  readonly runId: RunId | undefined;
  /**
   * Items from the dispatch receipt until this run settles. Nothing is
   * buffered until the iterable is iterated; each iteration sees the items
   * that arrive from that point on.
   */
  events(): AsyncIterable<ThreadWatchItem>;
  /** Resolves when the run that took `messageId` reaches a terminal state. */
  readonly completion: Promise<TurnOutcome>;
  interrupt(): Promise<void>;
}

export interface TurnDependencies {
  dispatch(command: OrchestrationV2Command, signal?: AbortSignal): Promise<DispatchResult>;
  watch(threadId: ThreadId, options: ThreadWatchOptions): AsyncIterable<ThreadWatchItem>;
  interrupt(threadId: ThreadId, runId?: RunId, signal?: AbortSignal): Promise<void>;
  newCommandId(): CommandId;
}

export interface TurnIdentity {
  readonly threadId: ThreadId;
  readonly messageId: MessageId;
  readonly commandId: CommandId;
  readonly sequence: number;
  readonly signal?: AbortSignal;
}

export function createTurnHandle(deps: TurnDependencies, identity: TurnIdentity): TurnHandle {
  return new Turn(deps, identity);
}

/** Test seam: how many `events()` consumers are attached and how many items they have buffered. */
export function inspectTurn(handle: TurnHandle): { subscribers: number; buffered: number } {
  if (!(handle instanceof Turn)) return { subscribers: 0, buffered: 0 };
  return handle.inspect();
}

class Turn implements TurnHandle {
  readonly threadId: ThreadId;
  readonly messageId: MessageId;
  readonly commandId: CommandId;
  readonly sequence: number;
  readonly #deps: TurnDependencies;
  readonly #signal: AbortSignal | undefined;
  readonly #controller = new AbortController();
  readonly #subscribers = new Set<Channel<ThreadWatchItem>>();
  readonly #adoption: TurnAdoption;
  #outcome: Promise<TurnOutcome> | undefined;
  #resolve: ((outcome: TurnOutcome) => void) | undefined;
  #reject: ((error: T3Error) => void) | undefined;
  #done = false;

  constructor(deps: TurnDependencies, identity: TurnIdentity) {
    this.#deps = deps;
    this.threadId = identity.threadId;
    this.messageId = identity.messageId;
    this.commandId = identity.commandId;
    this.sequence = identity.sequence;
    this.#signal = identity.signal;
    this.#adoption = new TurnAdoption(identity.messageId);
  }

  get runId(): RunId | undefined {
    return this.#adoption.runId;
  }

  get completion(): Promise<TurnOutcome> {
    return this.#start();
  }

  events(): AsyncIterable<ThreadWatchItem> {
    return { [Symbol.asyncIterator]: () => this.#subscribe()[Symbol.asyncIterator]() };
  }

  inspect(): { subscribers: number; buffered: number } {
    let buffered = 0;
    for (const channel of this.#subscribers) buffered += channel.size;
    return { subscribers: this.#subscribers.size, buffered };
  }

  /** Interrupts the followed run, or the thread's active run while ours is not yet known. */
  interrupt(): Promise<void> {
    return this.#deps.interrupt(this.threadId, this.#adoption.runId);
  }

  /** Registers a consumer channel and starts the watch if it is not running yet. */
  #subscribe(): Channel<ThreadWatchItem> {
    const channel = createChannel<ThreadWatchItem>({
      onReturn: () => this.#subscribers.delete(channel),
    });
    if (this.#done) {
      channel.end();
      return channel;
    }
    this.#subscribers.add(channel);
    void this.#start();
    return channel;
  }

  #start(): Promise<TurnOutcome> {
    if (this.#outcome) return this.#outcome;
    this.#outcome = new Promise<TurnOutcome>((resolve, reject) => {
      this.#resolve = resolve;
      this.#reject = reject;
    });
    // A consumer that only iterates events() must not see an unhandled rejection.
    this.#outcome.catch(() => undefined);
    this.#signal?.addEventListener("abort", () => this.#controller.abort(), { once: true });
    if (this.#signal?.aborted) this.#controller.abort();
    void this.#run();
    return this.#outcome;
  }

  async #run(): Promise<void> {
    try {
      // `afterSequence` is exclusive on the server. The receipt is the sequence
      // of the last event our command produced, so resuming after it replays
      // exactly what the run produces; the snapshot the server sends instead
      // when nothing is newer already links our message to its run.
      const watch = this.#deps.watch(this.threadId, {
        afterSequence: this.sequence,
        signal: this.#controller.signal,
      });
      for await (const item of watch) {
        for (const channel of this.#subscribers) channel.push(item);
        this.#track(item);
        if (this.#done) break;
      }
      if (!this.#done) {
        this.#fail(new T3InterruptedError("The thread watch ended before the turn settled."));
      }
    } catch (error) {
      this.#fail(
        error instanceof T3Error
          ? error
          : new T3ConnectionError("closed", "The turn watch failed.", { cause: error }),
      );
    } finally {
      this.#controller.abort();
      for (const channel of this.#subscribers) channel.end();
      this.#subscribers.clear();
    }
  }

  #track(item: ThreadWatchItem): void {
    switch (item.kind) {
      case "snapshot": {
        const outcome = this.#adoption.seed(item.snapshot.projection);
        if (outcome) this.#settle(outcome);
        return;
      }
      case "event":
        this.#adoption.onEvent(item.event);
        return;
      case "turn-settled":
        if (this.#adoption.isOurs(item.outcome.runId)) this.#settle(item.outcome);
        return;
      default:
        return;
    }
  }

  #settle(outcome: TurnOutcome): void {
    if (this.#done) return;
    this.#done = true;
    this.#resolve?.(outcome);
  }

  #fail(error: T3Error): void {
    if (this.#done) return;
    this.#done = true;
    this.#reject?.(error);
  }
}
