// ---
// relationships:
//   implements: request-watch
// ---
/**
 * Reporting for the request watch (`request-watch` design, `watching` Reporting): the run's set
 * of reported keys, the requests seen pending that wait for their card, and the
 * `ReportedRequest` builder, and the timers of the card waits.
 */
import type { ProjectId, RuntimeRequestId, ThreadId } from "../schemas/common.ts";
import type { OrchestrationV2ThreadProjection } from "../schemas/orchestration/projection.ts";
import { isSelected, type RequestFilters } from "./requestIndex.ts";
import { pendingRequests, requestWithCard, type PendingRequest } from "./threadDerived.ts";

/** A pending request with the thread and project it belongs to. */
export type ReportedRequest = PendingRequest & {
  readonly thread: {
    readonly id: ThreadId;
    readonly title: string;
    readonly tags: readonly string[];
  };
  /** `title` is the project's name; null while the watch has not seen the project. */
  readonly project: { readonly id: ProjectId; readonly title: string | null };
};

type ThreadRecord = OrchestrationV2ThreadProjection["thread"];

/** A request seen pending whose report waits for its card. */
export interface SeenRequest {
  readonly key: string;
  readonly threadId: ThreadId;
  readonly requestId: RuntimeRequestId;
  /** The record and card the latest view that held the request joined. */
  readonly last: PendingRequest;
  /** The thread record of the latest view of the thread. */
  readonly thread: ThreadRecord;
}

/** One key per request: its thread id and runtime request id. */
export function requestKey(threadId: string, requestId: string): string {
  return JSON.stringify([threadId, requestId]);
}

export class RequestReports {
  readonly #reported = new Set<string>();
  readonly #seen = new Map<string, SeenRequest>();

  /**
   * Reads a thread's view. Returns the selected requests it holds pending that the run sees for
   * the first time, and every seen request of the thread whose card the view now holds, oldest
   * `createdAt` first: those are ready to report.
   */
  read(
    threadId: ThreadId,
    view: OrchestrationV2ThreadProjection,
    filters: RequestFilters,
  ): { readonly seen: readonly SeenRequest[]; readonly ready: readonly SeenRequest[] } {
    const seen: SeenRequest[] = [];
    for (const request of pendingRequests(view)) {
      const key = requestKey(threadId, request.requestId);
      if (this.#reported.has(key) || this.#seen.has(key)) continue;
      if (!isSelected(filters, request, view.thread)) continue;
      const entry = {
        key,
        threadId,
        requestId: request.requestId,
        last: request,
        thread: view.thread,
      };
      this.#seen.set(key, entry);
      seen.push(entry);
    }
    const ready: SeenRequest[] = [];
    for (const entry of this.#ofThread(threadId)) {
      const updated = joined(entry, view);
      this.#seen.set(entry.key, updated);
      if (updated.last.item !== undefined) ready.push(updated);
    }
    return { seen, ready };
  }

  /** A request of this thread waits for its card. */
  waiting(threadId: ThreadId): boolean {
    return this.#ofThread(threadId).length > 0;
  }

  /**
   * Ends a seen request's wait. It is reported, from `view` when that view holds it, when the
   * latest thread record still selects it; otherwise it is dropped and can be seen again.
   */
  finish(
    key: string,
    view: OrchestrationV2ThreadProjection | undefined,
    filters: RequestFilters,
    projectTitle: (projectId: ProjectId) => string | null,
  ): ReportedRequest | undefined {
    const entry = this.#seen.get(key);
    if (entry === undefined) return undefined;
    this.#seen.delete(key);
    const { last, thread } = view === undefined ? entry : joined(entry, view);
    if (!isSelected(filters, last, thread)) return undefined;
    this.#reported.add(key);
    return {
      ...last,
      thread: { id: thread.id, title: thread.title, tags: thread.tags ?? [] },
      project: { id: thread.projectId, title: projectTitle(thread.projectId) },
    };
  }

  #ofThread(threadId: ThreadId): SeenRequest[] {
    return [...this.#seen.values()]
      .filter((entry) => entry.threadId === threadId)
      .sort(
        (a, b) =>
          a.last.request.createdAt.localeCompare(b.last.request.createdAt) ||
          a.requestId.localeCompare(b.requestId),
      );
  }
}

/** Takes the view's thread record, and its record and card of the request when it holds one. */
function joined(entry: SeenRequest, view: OrchestrationV2ThreadProjection): SeenRequest {
  const record = view.runtimeRequests.find((request) => request.id === entry.requestId);
  return {
    ...entry,
    last: record === undefined ? entry.last : requestWithCard(view, record),
    thread: view.thread,
  };
}

/** The timers of the requests that wait for their card, by key. */
export class CardWaits {
  readonly #timers = new Map<
    string,
    { threadId: ThreadId; timer: ReturnType<typeof setTimeout> }
  >();

  start(key: string, threadId: ThreadId, ms: number, due: () => void): void {
    this.#timers.set(key, { threadId, timer: setTimeout(due, ms) });
  }

  /** Stops a wait; returns its thread, or undefined when the key was not waiting. */
  stop(key: string): ThreadId | undefined {
    const waiting = this.#timers.get(key);
    if (waiting === undefined) return undefined;
    clearTimeout(waiting.timer);
    this.#timers.delete(key);
    return waiting.threadId;
  }

  clear(): void {
    for (const { timer } of this.#timers.values()) clearTimeout(timer);
    this.#timers.clear();
  }
}
