/**
 * ThreadProjectionTracker: the stateful half of watchThread. It owns the
 * projected thread and turns each applied event into derived items
 * (assistant text, request lifecycle, settled runs).
 */
import type { MessageId, RunId, RuntimeRequestId, TurnItemId } from "../schemas/common.ts";
import type { OrchestrationV2DomainEvent } from "../schemas/orchestration/events.ts";
import type { OrchestrationV2ThreadProjection } from "../schemas/orchestration/projection.ts";
import { isRunTerminalStatus } from "../schemas/orchestration/runs.ts";
import { isTurnItemOfType } from "../schemas/orchestration/turnItems.ts";
import {
  applyThreadEvent,
  isKnownVariant,
  pendingRequests,
  runOutcome,
  type PendingRequest,
  type TurnOutcome,
} from "./threadProjection.ts";

export type ThreadDerivedItem =
  | {
      /** The assistant's text so far; `delta` is what the last update appended when it only appended. */
      readonly kind: "assistant-delta";
      readonly runId: RunId | null;
      readonly itemId: TurnItemId;
      readonly messageId: MessageId;
      readonly text: string;
      readonly delta: string;
      readonly streaming: boolean;
    }
  | ({ readonly kind: "approval-requested" } & Omit<
      Extract<PendingRequest, { kind: "approval" }>,
      "kind"
    >)
  | ({ readonly kind: "user-input-requested" } & Omit<
      Extract<PendingRequest, { kind: "user-input" }>,
      "kind"
    >)
  | { readonly kind: "request-resolved"; readonly requestId: RuntimeRequestId }
  | { readonly kind: "turn-settled"; readonly outcome: TurnOutcome };

export class ThreadProjectionTracker {
  #projection: OrchestrationV2ThreadProjection | undefined;
  /** Sequence the projection reflects; events at or below it are not re-applied. */
  #projectedSequence = 0;
  readonly #announced = new Set<RuntimeRequestId>();
  /** Run ids whose settlement was announced. */
  readonly #settled = new Set<RunId>();

  get seeded(): boolean {
    return this.#projection !== undefined;
  }

  get projection(): OrchestrationV2ThreadProjection | undefined {
    return this.#projection;
  }

  /** Replaces the projection with a snapshot and announces its open requests. */
  *seed(snapshot: {
    readonly snapshotSequence: number;
    readonly projection: OrchestrationV2ThreadProjection;
  }): Generator<ThreadDerivedItem> {
    this.#projection = snapshot.projection;
    this.#projectedSequence = Math.max(this.#projectedSequence, snapshot.snapshotSequence);
    for (const run of snapshot.projection.runs) {
      if (isRunTerminalStatus(run.status)) this.#settled.add(run.id);
    }
    yield* this.#reconcileRequests();
  }

  /** Applies one event and yields what it changed. */
  *apply(sequence: number, event: OrchestrationV2DomainEvent): Generator<ThreadDerivedItem> {
    if (!isKnownVariant(event)) return;
    const projection = this.#projection;
    if (!projection) return;
    if (sequence <= this.#projectedSequence) return;
    const next = applyThreadEvent(projection, event);
    this.#projectedSequence = sequence;
    this.#projection = next;
    if (next === projection) return;
    yield* this.#assistantText(projection, event);
    yield* this.#reconcileRequests();
    yield* this.#settle(event, next);
  }

  *#assistantText(
    before: OrchestrationV2ThreadProjection,
    event: Exclude<OrchestrationV2DomainEvent, { unknown: true }>,
  ): Generator<ThreadDerivedItem> {
    if (event.type !== "turn-item.updated") return;
    const item = event.payload;
    if (!isTurnItemOfType(item, "assistant_message")) return;
    const previous = before.turnItems.find((candidate) => candidate.id === item.id);
    const previousText =
      previous && isTurnItemOfType(previous, "assistant_message") ? previous.text : "";
    const delta = item.text.startsWith(previousText)
      ? item.text.slice(previousText.length)
      : item.text;
    yield {
      kind: "assistant-delta",
      runId: item.runId,
      itemId: item.id,
      messageId: item.messageId,
      text: item.text,
      delta,
      streaming: item.streaming,
    };
  }

  *#settle(
    event: Exclude<OrchestrationV2DomainEvent, { unknown: true }>,
    projection: OrchestrationV2ThreadProjection,
  ): Generator<ThreadDerivedItem> {
    if (event.type !== "run.updated" && event.type !== "run.created") return;
    const run = projection.runs.find((candidate) => candidate.id === event.payload.id);
    if (!run || !isRunTerminalStatus(run.status) || this.#settled.has(run.id)) return;
    this.#settled.add(run.id);
    const outcome = runOutcome(projection, run);
    if (outcome) yield { kind: "turn-settled", outcome };
  }

  *#reconcileRequests(): Generator<ThreadDerivedItem> {
    const projection = this.#projection;
    if (!projection) return;
    const open = pendingRequests(projection);
    const openIds = new Set(open.map((r) => r.requestId));
    for (const requestId of this.#announced) {
      if (openIds.has(requestId)) continue;
      this.#announced.delete(requestId);
      yield { kind: "request-resolved", requestId };
    }
    for (const request of open) {
      if (this.#announced.has(request.requestId)) continue;
      // A user-input request's questions live on its timeline item, which can
      // arrive after the request; announce it once the questions are known.
      if (request.kind === "user-input" && request.item === undefined) continue;
      this.#announced.add(request.requestId);
      const { kind: _kind, ...rest } = request;
      yield request.kind === "approval"
        ? { kind: "approval-requested", ...rest, item: request.item }
        : {
            kind: "user-input-requested",
            ...rest,
            item: request.item,
            questions: request.questions,
          };
    }
  }
}
