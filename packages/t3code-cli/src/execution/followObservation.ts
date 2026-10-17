// ---
// relationships:
//   implements: command-line
// ---
import {
  activeRun,
  applyThreadEvent,
  pendingRequests,
  runOutcome,
  type OrchestrationV2ThreadProjection,
  type ThreadWatchItem,
  type TurnOutcome,
} from "@wyrd-company/t3code-lib";
import type { FollowTarget } from "./followTarget.ts";
import type { ExecutionResult } from "../output.ts";

/** The selected run stays fixed even when another run starts in the thread. */
export class FollowObservation {
  projection: OrchestrationV2ThreadProjection | undefined;
  outcome: TurnOutcome | undefined;
  readonly result: ExecutionResult;
  readonly target: FollowTarget;

  constructor(target: FollowTarget) {
    this.target = target;
    this.result = {
      threadId: target.threadId,
      runId: target.runId ?? target.turn?.runId ?? null,
      state: "unknown",
      assistantMessage: null,
      pendingRequests: [],
      exitCode: 0,
      durationMs: 0,
    };
  }

  observe(item: ThreadWatchItem): void {
    if (item.kind === "decode-error") throw item.error;
    if (item.kind === "snapshot") this.projection = item.snapshot.projection;
    if (item.kind === "event" && this.projection)
      this.projection = applyThreadEvent(this.projection, item.event);
    this.result.runId = this.target.turn?.runId ?? this.result.runId;
    const projection = this.projection;
    if (projection) {
      if (this.result.runId === null && !this.target.turn) {
        const run =
          activeRun(projection) ??
          projection.runs.reduce<(typeof projection.runs)[number] | undefined>(
            (latest, candidate) =>
              !latest || candidate.ordinal > latest.ordinal ? candidate : latest,
            undefined,
          );
        this.result.runId ??= run?.id ?? null;
        if (this.result.runId === null) this.result.state = "idle";
      }
      const run = projection.runs.find((candidate) => candidate.id === this.result.runId);
      if (run) {
        this.result.state = run.status;
        this.outcome = runOutcome(projection, run);
      }
      this.result.pendingRequests = pendingRequests(projection).filter(
        (request) =>
          this.result.runId !== null &&
          (request.item?.runId == null || request.item.runId === this.result.runId),
      );
    }
    if (item.kind === "turn-settled" && item.outcome.runId === this.result.runId)
      this.setOutcome(item.outcome);
  }

  setOutcome(outcome: TurnOutcome): void {
    this.outcome = outcome;
    this.result.runId = outcome.runId;
    this.result.state = outcome.state;
    this.result.assistantMessage = outcome.assistantMessage?.text ?? null;
  }
}
