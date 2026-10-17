// ---
// relationships:
//   implements: output-contract
// ---
import {
  T3ConnectionError,
  threadId,
  runId,
  type PendingRequest,
  type TurnOutcome,
  type ThreadWatchItem,
} from "@wyrd-company/t3code-lib";
import type { Invocation } from "../context.ts";
import { exitCodeFor, exitCodeForState, failureFor } from "../errors.ts";
import type { ExecutionResult } from "../output.ts";
import type { FollowPolicy, FollowTarget } from "./followTarget.ts";
import { FollowObservation } from "./followObservation.ts";
import { followSignals } from "./signals.ts";
import { readConversation, lastAssistantMessage } from "./transcript.ts";
export { followPolicy } from "./followPolicy.ts";
export type { FollowPolicy, FollowTarget } from "./followTarget.ts";

type Reason = "terminal" | "pending" | "deadline" | "signal";

export async function followRun(
  invocation: Invocation,
  target: FollowTarget,
  policy: FollowPolicy,
): Promise<ExecutionResult> {
  const observation = new FollowObservation(target);
  const result = observation.result;
  const controller = new AbortController();
  const signals = followSignals(invocation.output);
  let deadlineTimer: ReturnType<typeof setTimeout> | undefined;
  let graceTimer: ReturnType<typeof setTimeout> | undefined;
  let stopping = false;
  let iterator: AsyncIterator<ThreadWatchItem> | undefined;
  invocation.output.progress(`Thread: ${target.threadId}`);
  try {
    const client = await invocation.client();
    const id = threadId(target.threadId);
    const answered = new Set<string>();
    const source = target.turn?.events() ?? client.threads.watch(id, { signal: controller.signal });
    iterator = source[Symbol.asyncIterator]();
    const events = { [Symbol.asyncIterator]: () => iterator! };
    const completion = target.turn?.completion.then((outcome) => {
      if (!controller.signal.aborted) observation.setOutcome(outcome);
      return "terminal" as const;
    });
    const pump = (async (): Promise<Reason> => {
      for await (const item of events) {
        if (controller.signal.aborted) break;
        observation.observe(item);
        if (item.kind === "assistant-delta" && item.runId === result.runId)
          invocation.output.delta(item.delta);
        if (item.kind === "reconnected") invocation.output.event({ type: "reconnected" });
        if (observation.outcome || result.state === "idle") return "terminal";
        if (stopping) continue;
        const open = result.pendingRequests as readonly PendingRequest[];
        for (const request of open) {
          if (request.kind !== "approval" || !policy.approve || answered.has(request.requestId))
            continue;
          answered.add(request.requestId);
          await client.threads.respondToApproval(
            {
              threadId: id,
              requestId: request.requestId,
              decision: policy.approve === "accept" ? "accept" : "decline",
            },
            controller.signal,
          );
        }
        const unresolved = open.filter(
          (request) =>
            !answered.has(request.requestId) &&
            (request.kind !== "user-input" || request.item !== undefined),
        );
        if (unresolved.length && policy.onRequest === "fail") {
          result.pendingRequests = unresolved;
          if (!invocation.output.json) printRequests(invocation, unresolved);
          return "pending";
        }
      }
      if (controller.signal.aborted) return "terminal";
      if (observation.outcome) return "terminal";
      throw new T3ConnectionError("closed", "Thread watch ended before its run settled.");
    })();
    const racers: Promise<Reason>[] = [pump, signals.first];
    if (completion) racers.push(completion);
    if (policy.timeoutMs !== undefined)
      racers.push(
        new Promise((resolve) => {
          deadlineTimer = setTimeout(
            () => resolve("deadline"),
            Math.max(0, policy.timeoutMs! - (Date.now() - invocation.startedAt)),
          );
        }),
      );
    const reason = await Promise.race(racers);
    stopping = true;
    if (reason === "deadline" || reason === "signal") {
      invocation.errorContext =
        policy.onTimeout === "detach" && reason === "deadline" ? "run-detach" : "run-interrupt";
      if (reason === "signal" || policy.onTimeout === "interrupt") {
        await client.threads.interrupt(
          id,
          result.runId === null ? undefined : runId(result.runId),
          { holdQueue: true },
        );
        // The grace starts after the interrupt request has been acknowledged.
        const grace = new Promise<Reason>((resolve) => {
          graceTimer = setTimeout(() => resolve("deadline"), 5000);
        });
        await Promise.race([
          pump.catch(() => "terminal" as const),
          ...(completion ? [completion.catch(() => "terminal" as const)] : []),
          grace,
        ]);
      }
      const interrupted = reason === "signal" || signals.interrupted;
      result.exitCode = interrupted ? 4 : policy.onTimeout === "detach" ? 5 : 6;
      result.error = {
        code: interrupted ? "interrupted" : "timeout",
        message: interrupted
          ? "Operation interrupted."
          : policy.onTimeout === "detach"
            ? "Timed out; run remains active."
            : "Timed out; interruption requested.",
      };
    } else if (reason === "pending") {
      result.exitCode = 7;
      result.error = { code: "pending_request", message: "Run needs a response." };
    } else {
      result.exitCode = exitCodeForState(result.state);
      if (result.exitCode !== 0)
        result.error = {
          code: result.state,
          message: result.exitCode === 4 ? "Operation interrupted." : "Run failed.",
        };
      if (result.state !== "idle") {
        const outcome: TurnOutcome | undefined = observation.outcome;
        result.assistantMessage =
          outcome?.assistantMessage?.text ??
          lastAssistantMessage(await readConversation(client, target.threadId, controller.signal));
      }
    }
  } catch (error) {
    result.runId = target.turn?.runId ?? result.runId;
    result.exitCode = exitCodeFor(error, invocation.errorContext);
    result.error = failureFor(error, invocation.errorContext);
  } finally {
    controller.abort();
    void iterator?.return?.();
    clearTimeout(deadlineTimer);
    clearTimeout(graceTimer);
    signals.close();
    result.durationMs = Date.now() - invocation.startedAt;
  }
  return result;
}

function printRequests(invocation: Invocation, requests: readonly PendingRequest[]): void {
  for (const request of requests) {
    invocation.output.progress(`Request ${request.requestId} (${request.kind})`);
    if (request.kind === "approval")
      invocation.output.progress(request.item?.prompt ?? "Approval required.");
    else for (const question of request.questions) invocation.output.progress(question.question);
  }
}
