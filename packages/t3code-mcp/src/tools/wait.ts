// ---
// relationships:
//   implements: mcp
// ---
import { z } from "zod";
import {
  applyThreadEvent,
  threadId,
  type OrchestrationV2ThreadProjection,
} from "@wyrd-company/t3code-lib";
import { requireThread } from "./selection.ts";
import { projectionView } from "../views/thread.ts";
import { ToolError } from "../errors.ts";
import { tool, serverArg, type ToolContext } from "./spec.ts";
export interface WaitInput {
  server?: string | undefined;
  threads: { server?: string | undefined; threadId: string }[];
  until: "any" | "all";
  timeoutMs: number;
}
export async function waitForThreads(input: WaitInput, context: ToolContext): Promise<object> {
  const { registry, signal } = context;
  signal.throwIfAborted();
  const refs = input.threads.map((ref) => ({
    server: registry.resolve(ref.server ?? input.server),
    threadId: ref.threadId,
  }));
  const controller = new AbortController();
  const combined = AbortSignal.any([signal, controller.signal]);
  const views: (
    | ReturnType<typeof projectionView>
    | { server: string; threadId: string; settled: false; status: "unknown" }
  )[] = refs.map((ref) => ({ ...ref, settled: false, status: "unknown" }));
  let finish!: (timedOut: boolean) => void;
  let fail!: (error: unknown) => void;
  const completed = new Promise<boolean>((resolve, reject) => {
    finish = resolve;
    fail = reject;
  });
  const abort = () => fail(signal.reason);
  signal.addEventListener("abort", abort, { once: true });
  const started = Date.now();
  const timeout = setTimeout(() => finish(true), input.timeoutMs);
  const progress =
    context.progress === undefined
      ? undefined
      : setInterval(() => {
          void context.progress!(Date.now() - started).catch(fail);
        }, 15_000);
  const watches = refs.map(async (ref, index) => {
    const client = await registry.client(ref.server, "thread_wait");
    await requireThread(client, ref.threadId, combined);
    let projection: OrchestrationV2ThreadProjection | undefined;
    for await (const item of client.threads.watch(threadId(ref.threadId), { signal: combined })) {
      if (combined.aborted) return;
      if (item.kind === "decode-error") throw item.error;
      if (item.kind === "snapshot") projection = item.snapshot.projection;
      if (item.kind === "event" && projection)
        projection = applyThreadEvent(projection, item.event);
      if (!projection) continue;
      views[index] = projectionView(ref.server, projection);
      const states = views.map((view) => view.settled);
      if (input.until === "all" ? states.every(Boolean) : states.some(Boolean)) finish(false);
    }
    if (!combined.aborted)
      throw new ToolError("invalid_state", "Thread watch ended before the wait condition.");
  });
  // Observe every rejection immediately; cancel and join every watcher before returning.
  for (const watch of watches) void watch.catch(fail);
  try {
    const timedOut = await completed;
    return {
      server: new Set(refs.map((ref) => ref.server)).size === 1 ? refs[0]!.server : null,
      threads: views,
      until: input.until,
      timedOut,
      elapsedMs: Date.now() - started,
    };
  } finally {
    clearTimeout(timeout);
    clearInterval(progress);
    signal.removeEventListener("abort", abort);
    controller.abort();
    await Promise.allSettled(watches);
  }
}
export const waitTools = [
  tool(
    "thread_wait",
    "Wait across threads on one or more servers until any/all have a terminal latest run or pending request. threads contains {server,threadId}; server may use the configured default. until defaults to all. timeoutMs defaults to 45000, maximum 600000. Timeout returns timedOut:true without interrupting work; call again. Cancellation ends only this wait. Progress is sent every 15s when requested. Read results with thread_read or answer pending requests.",
    true,
    {
      server: serverArg,
      threads: z.array(z.object({ server: serverArg, threadId: z.string().min(1) })).min(1),
      until: z.enum(["any", "all"]).default("all"),
      timeoutMs: z.int().min(1).max(600_000).default(45_000),
    },
    waitForThreads,
  ),
];
