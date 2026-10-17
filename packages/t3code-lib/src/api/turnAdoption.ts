/**
 * TurnAdoption: decides which run a `message.dispatch` command produced.
 *
 * The server links the message to its run: a new run's `userMessageId` is
 * the message that started it, and the message record's `runId` names the
 * run that took it, also when the message was steered into a run that was
 * already active. So the run we follow is the one either link names; nothing
 * else is guessed. No I/O.
 */
import type { MessageId, RunId } from "../schemas/common.ts";
import type { OrchestrationV2DomainEvent } from "../schemas/orchestration/events.ts";
import type { OrchestrationV2ThreadProjection } from "../schemas/orchestration/projection.ts";
import { isKnownVariant, runOutcome, type TurnOutcome } from "./threadProjection.ts";

export class TurnAdoption {
  readonly #messageId: MessageId;
  #runId: RunId | undefined;

  constructor(messageId: MessageId) {
    this.#messageId = messageId;
  }

  /** The run being followed, once known. */
  get runId(): RunId | undefined {
    return this.#runId;
  }

  /** A snapshot may already link our message to a run, and that run may already be settled. */
  seed(projection: OrchestrationV2ThreadProjection): TurnOutcome | undefined {
    const message = projection.messages.find((m) => m.id === this.#messageId);
    if (message?.runId) this.#link(message.runId);
    const byRun = projection.runs.find((run) => run.userMessageId === this.#messageId);
    if (byRun) this.#link(byRun.id);
    const runId = this.#runId;
    if (runId === undefined) return undefined;
    const run = projection.runs.find((candidate) => candidate.id === runId);
    return run === undefined ? undefined : runOutcome(projection, run);
  }

  onEvent(event: OrchestrationV2DomainEvent): void {
    if (!isKnownVariant(event)) return;
    if (event.type === "message.updated") {
      const message = event.payload;
      if (message.id === this.#messageId && message.runId !== null) this.#link(message.runId);
      return;
    }
    if (event.type === "run.created" || event.type === "run.updated") {
      if (event.payload.userMessageId === this.#messageId) this.#link(event.payload.id);
    }
  }

  /** `true` when a settled run announced by the projection is ours. */
  isOurs(runId: RunId): boolean {
    return runId === this.#runId;
  }

  #link(runId: RunId): void {
    this.#runId = runId;
  }
}
