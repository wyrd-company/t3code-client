// ---
// relationships:
//   implements: command-line
// ---
import type { Invocation } from "../context.ts";
import type { InvocationHandler } from "../main.ts";
import { emptyExecution, type ExecutionResult } from "../output.ts";
import { exitCodeFor, failureFor } from "../errors.ts";
import { dispatchPrompt, dispatchedRunId } from "./dispatch.ts";
import type { FollowPolicy, FollowTarget } from "./followTarget.ts";
import { readPrompt } from "./prompt.ts";
import { validateDispatchOptions, type DispatchOptions } from "./selection.ts";

export interface Follower {
  followRun(
    invocation: Invocation,
    target: FollowTarget,
    policy: FollowPolicy,
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
    validateDispatchOptions(dispatchOptions);
    const text = await readPrompt(kind === "send" ? args[1] : args[0], options.promptFile);
    const waiting = kind !== "start" || options.wait === true;
    const follow = waiting ? await follower() : undefined;
    // Parse policy before any mutation so invalid policies cannot create a thread.
    const policy = follow?.followPolicy(options, "interrupt");
    let target: FollowTarget | undefined;
    try {
      target = await dispatchPrompt(invocation, text, dispatchOptions, (known) => {
        target = known;
      });
      invocation.output.progress(`Thread: ${target.threadId}`);
      if (follow !== undefined && policy !== undefined) {
        invocation.output.finish(await follow.followRun(invocation, target, policy));
      } else {
        const runId = await dispatchedRunId(target);
        invocation.output.finish(
          { data: { threadId: target.threadId, runId }, exitCode: 0 },
          target.threadId,
        );
      }
    } catch (error) {
      const failure = {
        exitCode: exitCodeFor(error, invocation.errorContext),
        error: failureFor(error, invocation.errorContext),
      };
      const threadId = target?.threadId ?? null;
      const runId = target?.turn?.runId ?? target?.runId ?? null;
      if (waiting)
        invocation.output.finish({
          ...emptyExecution(Date.now() - invocation.startedAt),
          threadId,
          runId,
          ...failure,
        });
      else
        invocation.output.finish({
          data: threadId === null ? null : { threadId, runId },
          ...failure,
        });
    }
  };
}
