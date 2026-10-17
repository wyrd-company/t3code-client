// ---
// relationships:
//   implements: command-line
// ---
import { T3InterruptedError, threadId, runId } from "@wyrd-company/t3code-lib";
import { followSignals, type SignalScope } from "./signals.ts";
import type { Invocation } from "../context.ts";
import type { InvocationHandler } from "../main.ts";
import { emptyExecution, type ExecutionResult } from "../output.ts";
import { exitCodeFor, failureFor } from "../errors.ts";
import { dispatchPrompt, dispatchedRunId, type DispatchTarget } from "./dispatch.ts";
import type { FollowPolicy, FollowTarget } from "./followTarget.ts";
import { readPrompt } from "./prompt.ts";
import { validateDispatchOptions, type DispatchOptions } from "./selection.ts";

export interface Follower {
  followRun(
    invocation: Invocation,
    target: FollowTarget,
    policy: FollowPolicy,
    scope?: SignalScope,
  ): Promise<ExecutionResult>;
  followPolicy(
    options: Record<string, unknown>,
    defaultOnTimeout: "interrupt" | "detach",
  ): FollowPolicy;
}

/** Injection keeps command composition testable without owning the follower. */
export function dispatchHandler(
  kind: "run" | "start" | "send",
  follower: () => Promise<Follower>,
): InvocationHandler {
  return async (args, command, invocation) => {
    const options = command.optsWithGlobals<DispatchOptions & Record<string, unknown>>();
    const dispatchOptions = kind === "send" ? { ...options, thread: args[0]! } : options;
    const signals = followSignals(invocation.output);
    const waiting = kind !== "start" || options.wait === true;
    let target: DispatchTarget | undefined;
    let reported = false;
    function reportTarget(known: DispatchTarget) {
      invocation.output.progress(`Thread: ${known.threadId}`);
      reported = true;
      reportMode(known);
    }
    function reportMode(known: DispatchTarget) {
      if (
        known.runtimeMode !== null &&
        (options["logLevel"] === "info" || options["logLevel"] === "debug")
      )
        invocation.output.progress(`Runtime mode: ${known.runtimeMode}`);
    }
    try {
      validateDispatchOptions(dispatchOptions);
      const text = await signals.until(
        readPrompt(
          kind === "send" ? args[1] : args[0],
          options.promptFile,
          undefined,
          signals.signal,
        ),
      );
      const follow = waiting ? await signals.until(follower()) : undefined;
      // Parse policy before any mutation so invalid policies cannot create a thread.
      const policy = follow?.followPolicy(options, "interrupt");
      target = await dispatchPrompt(
        invocation,
        text,
        dispatchOptions,
        (known) => {
          target = known;
        },
        signals,
      );
      // A waiting command normally lets the follower observe the handle's stream.
      // If cancelled during dispatch, retain the acknowledgement and exact run link.
      let linked: string | undefined;
      if (!waiting || signals.interrupted) {
        linked = await dispatchedRunId(target);
        target = { ...target, runId: linked };
        if (signals.interrupted) {
          reportTarget(target);
          invocation.output.progress(`Run: ${linked}`);
          const client = await invocation.client();
          invocation.errorContext = "run-interrupt";
          await client.threads.interrupt(threadId(target.threadId), runId(linked), {
            holdQueue: true,
          });
          throw new T3InterruptedError("Operation interrupted.");
        }
      }
      if (follow !== undefined && policy !== undefined) {
        // The follower shares this scope and reports the thread before its first await.
        reported = true;
        reportMode(target);
        invocation.output.finish({
          ...(await follow.followRun(invocation, target, policy, signals)),
          runtimeMode: target.runtimeMode,
        });
      } else {
        reportTarget(target);
        const runId = linked;
        invocation.output.finish(
          {
            data: { threadId: target.threadId, runId, runtimeMode: target.runtimeMode },
            exitCode: 0,
          },
          target.threadId,
        );
      }
    } catch (error) {
      if (target === undefined && !signals.interrupted) throw error;
      if (target !== undefined && !reported) reportTarget(target);
      const failure = {
        exitCode: signals.interrupted ? 4 : exitCodeFor(error, invocation.errorContext),
        error: failureFor(error, invocation.errorContext),
      };
      const threadId = target?.threadId ?? null;
      const runId = target?.turn?.runId ?? target?.runId ?? null;
      const runtimeMode = target?.runtimeMode ?? null;
      if (waiting)
        invocation.output.finish({
          ...emptyExecution(Date.now() - invocation.startedAt),
          threadId,
          runId,
          runtimeMode,
          ...failure,
        });
      else
        invocation.output.finish({
          data: threadId === null ? null : { threadId, runId, runtimeMode },
          ...failure,
        });
    } finally {
      signals.close();
    }
  };
}
