// ---
// relationships:
//   implements: request-watch
// ---
import {
  schemas,
  T3AuthError,
  T3ConnectionError,
  T3InterruptedError,
  T3PreconditionError,
  type PendingRequestKind,
  type RequestWatchFilters,
} from "@wyrd-company/t3code-lib";
import type { Command } from "commander";
import { exitCodeFor, failureFor } from "../errors.ts";
import { missingResource } from "../execution/selection.ts";
import { followSignals } from "../execution/signals.ts";
import type { InvocationHandler } from "../main.ts";
import { durationMs } from "../options.ts";
import { logEnabled } from "../output.ts";
import { emptyHookCounts, HookRunner, type HookOptions } from "./hookRunner.ts";
import { requestLine } from "./line.ts";

interface WatchFlags {
  project?: string[];
  kind?: PendingRequestKind;
  excludeThread?: string[];
  excludeTag?: string[];
  exec?: string;
  execConcurrency: string;
  execTimeout: string;
}

function parseList<T>(
  values: string[] = [],
  schema: { safeParse(value: string): { success: true; data: T } | { success: false } },
  flag: string,
): T[] {
  const checked = values.map((value) => {
    const parsed = schema.safeParse(value);
    if (!parsed.success) throw new T3PreconditionError(`Invalid ${flag} value.`);
    return parsed.data;
  });
  return [...new Set(checked)];
}

function parseFilters(flags: WatchFlags): RequestWatchFilters {
  return {
    projectIds: parseList(flags.project, schemas.common.ProjectId, "--project"),
    ...(flags.kind === undefined ? {} : { kind: flags.kind }),
    excludeThreadIds: parseList(flags.excludeThread, schemas.common.ThreadId, "--exclude-thread"),
    excludeTags: parseList(
      flags.excludeTag,
      schemas.orchestrationThreadTags.ThreadTag,
      "--exclude-tag",
    ),
  };
}

function parseHook(command: Command, flags: WatchFlags): HookOptions | undefined {
  if (flags.exec === undefined) {
    if (
      command.getOptionValueSource("execConcurrency") === "cli" ||
      command.getOptionValueSource("execTimeout") === "cli"
    )
      throw new T3PreconditionError("Hook settings require --exec.");
    return undefined;
  }
  if (!flags.exec.trim()) throw new T3PreconditionError("The --exec command cannot be blank.");
  const concurrency = Number(flags.execConcurrency);
  if (
    !/^\d+$/u.test(flags.execConcurrency) ||
    !Number.isSafeInteger(concurrency) ||
    concurrency < 1
  )
    throw new T3PreconditionError("Hook concurrency must be a positive integer.");
  return {
    command: flags.exec,
    concurrency,
    timeout: flags.execTimeout,
    timeoutMs: durationMs(flags.execTimeout),
  };
}

export const watch: InvocationHandler = async (_args, command, invocation) => {
  const flags = command.opts<WatchFlags>();
  const { output } = invocation;
  const log = (message: string, level?: "info" | "warn" | "error") => {
    if (level === undefined || logEnabled(level, invocation.options.logLevel))
      output.progress(message);
  };
  const interrupted = new T3InterruptedError("Operation interrupted.");
  let runner: HookRunner | undefined;
  let reported = 0;
  let missingProject: string | undefined;
  const initialHooks = flags.exec === undefined ? null : emptyHookCounts();
  const result = (error: unknown) => {
    const failure = failureFor(error, invocation.errorContext);
    if (missingProject !== undefined && error !== interrupted)
      failure.message = `Selected project ${JSON.stringify(missingProject)} not found.`;
    return {
      data: { reported, hooks: runner?.counts ?? initialHooks },
      exitCode: exitCodeFor(error, invocation.errorContext),
      error: failure,
    };
  };
  const signals = followSignals(output, {
    onForcedStop: () => {
      const diagnostics = runner?.forceStop() ?? [];
      output.finishForced(result(interrupted), diagnostics);
    },
  });

  try {
    let failure: unknown;
    let watching = false;
    try {
      const filters = parseFilters(flags);
      const hook = parseHook(command, flags);
      const client = await signals.until(invocation.client());
      signals.signal.throwIfAborted();
      const snapshot = await signals.until(client.projects.snapshot(signals.signal));
      signals.signal.throwIfAborted();
      const projectIds = new Set(
        snapshot.projects.filter(({ deletedAt }) => deletedAt === null).map(({ id }) => id),
      );
      missingProject = filters.projectIds?.find((id) => !projectIds.has(id));
      if (missingProject !== undefined) throw missingResource("project");

      if (hook !== undefined) {
        const { baseUrl } = await signals.until(invocation.resolve());
        signals.signal.throwIfAborted();
        runner = new HookRunner(hook, new URL(baseUrl).origin, log);
      }

      watching = true;
      for await (const item of client.requests.watch({ ...filters, signal: signals.signal })) {
        if (signals.interrupted) break;
        switch (item.kind) {
          case "request": {
            const { request } = item;
            const line = requestLine(request);
            output.line(line);
            reported++;
            runner?.enqueue({ requestId: request.requestId, threadId: request.thread.id, line });
            break;
          }
          case "synchronized":
            log("t3c: watching for requests", "info");
            break;
          case "reconnected":
            log("t3c: reconnected", "info");
            break;
          case "thread-error":
            log(
              `t3c: could not watch thread ${JSON.stringify(item.threadId)}: ${JSON.stringify(item.error.message)}`,
              "warn",
            );
            break;
          case "decode-error":
            log("t3c: skipped a server item that could not be decoded", "warn");
            break;
        }
      }
      failure = new Error("Request watch ended.");
    } catch (error) {
      failure =
        watching && error instanceof T3AuthError && error.code === "auth_invalid"
          ? new T3ConnectionError("closed", "The server rejected the watch credential.", {
              cause: error,
            })
          : error;
    } finally {
      signals.abort();
      await runner?.drain();
      await invocation.close();
    }
    output.finish(result(signals.interrupted ? interrupted : failure));
  } finally {
    signals.close();
  }
};
