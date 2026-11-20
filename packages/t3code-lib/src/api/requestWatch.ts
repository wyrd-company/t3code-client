// ---
// relationships:
//   implements: request-watch
// ---
/**
 * One run of `client.requests.watch` (`request-watch` design): the HTTP shell listing, the shell
 * watch from its cursor, resyncs, readiness and the end of the run. Every source pushes a task
 * into one loop, so the index, the thread watches and the reports change one task at a time.
 */
import {
  T3AuthError,
  T3ConnectionError,
  T3Error,
  T3RpcError,
  type T3DecodeError,
} from "../errors.ts";
import { createChannel, drain } from "../internal/asyncIterable.ts";
import { createBackoff, type Backoff, type BackoffPolicy } from "../internal/backoff.ts";
import type { ThreadId } from "../schemas/common.ts";
import type { OrchestrationV2ShellSnapshot } from "../schemas/orchestration/shell.ts";
import type { SocketState } from "../transport/socket.ts";
import { RequestIndex, type RequestFilters } from "./requestIndex.ts";
import { RequestReports, type ReportedRequest } from "./requestReports.ts";
import { ThreadWatches } from "./requestThreadWatches.ts";
import type { ShellWatchItem, ShellWatchOptions } from "./shell.ts";
import type { ThreadWatchItem, ThreadWatchOptions } from "./threadWatch.ts";

export type RequestWatchItem =
  | { readonly kind: "request"; readonly request: ReportedRequest }
  | { readonly kind: "synchronized" }
  | { readonly kind: "reconnected" }
  | { readonly kind: "thread-error"; readonly threadId: ThreadId; readonly error: T3Error }
  | { readonly kind: "decode-error"; readonly error: T3DecodeError };

/** What a run reads: the shell and thread facades and the socket's state. */
export interface RequestWatchSources {
  readonly shell: {
    snapshot(signal?: AbortSignal): Promise<OrchestrationV2ShellSnapshot>;
    watch(options: ShellWatchOptions): AsyncIterable<ShellWatchItem>;
  };
  readonly threads: {
    watch(threadId: ThreadId, options: ThreadWatchOptions): AsyncIterable<ThreadWatchItem>;
    detail(threadId: ThreadId, signal?: AbortSignal): Promise<unknown>;
  };
  readonly connection: {
    readonly state: SocketState;
    onStateChange(handler: (state: SocketState, error?: T3ConnectionError) => void): () => void;
  };
  /** The transport's reconnect backoff, used for every retry. */
  readonly backoff?: BackoffPolicy;
  /** How long a request seen pending waits for its card. Default 2,000 ms. */
  readonly cardWaitMs?: number;
}

type Readiness = {
  readonly item: "synchronized" | "reconnected";
  /** Set when the shell subscription delivers `synchronized`: the threads still busy then. */
  waiting: Set<ThreadId> | undefined;
};

export function watchRequests(
  sources: RequestWatchSources,
  filters: RequestFilters,
  signal?: AbortSignal,
): AsyncIterable<RequestWatchItem> {
  return { [Symbol.asyncIterator]: () => new RequestWatchRun(sources, filters, signal).run() };
}

class RequestWatchRun {
  readonly #sources: RequestWatchSources;
  readonly #signal: AbortSignal | undefined;
  readonly #stop = new AbortController();
  readonly #tasks = createChannel<() => void>();
  readonly #out: RequestWatchItem[] = [];
  readonly #index = new RequestIndex();
  readonly #threads: ThreadWatches;
  readonly #resyncBackoff: Backoff;
  #failure: { readonly error: unknown } | undefined;
  #socketState: SocketState;
  #shellGeneration = 0;
  #shellController: AbortController | undefined;
  #shellResuming = false;
  #resyncTimer: ReturnType<typeof setTimeout> | undefined;
  /** `snapshot-required` answers since the shell last delivered `synchronized`. */
  #fallbacks = 0;
  #listed = false;
  #synchronizedSent = false;
  #ready: Readiness | undefined;

  constructor(sources: RequestWatchSources, filters: RequestFilters, signal?: AbortSignal) {
    this.#sources = sources;
    this.#signal = signal;
    this.#socketState = sources.connection.state;
    this.#resyncBackoff = createBackoff(sources.backoff);
    this.#threads = new ThreadWatches({
      filters,
      index: this.#index,
      reports: new RequestReports(),
      signal: this.#stop.signal,
      backoff: sources.backoff,
      cardWaitMs: sources.cardWaitMs ?? 2_000,
      watch: (threadId, options) => sources.threads.watch(threadId, options),
      detail: (threadId, detailSignal) => sources.threads.detail(threadId, detailSignal),
      schedule: (task) => this.#tasks.push(task),
      endsRun: (error) => this.#endsRun(error),
      report: (request) => this.#out.push({ kind: "request", request }),
      threadError: (threadId, error) => this.#out.push({ kind: "thread-error", threadId, error }),
      decodeError: (item) => this.#out.push(item),
    });
  }

  async *run(): AsyncGenerator<RequestWatchItem> {
    const wake = () => this.#tasks.push(() => {});
    this.#signal?.addEventListener("abort", wake, { once: true });
    const offState = this.#sources.connection.onStateChange((state, error) => {
      this.#tasks.push(() => this.#onSocketState(state, error));
    });
    try {
      if (this.#socketState === "closed") this.#onSocketState("closed");
      else this.#startListing();
      for (;;) {
        for (let item = this.#out.shift(); item !== undefined; item = this.#out.shift()) {
          if (this.#signal?.aborted) return;
          yield item;
        }
        if (this.#failure !== undefined) throw this.#failure.error;
        if (this.#signal?.aborted) return;
        const next = await this.#tasks.next();
        if (next.done === true) return;
        next.value();
        this.#checkReady();
      }
    } finally {
      this.#signal?.removeEventListener("abort", wake);
      offState();
      this.#stop.abort();
      this.#shellController?.abort();
      if (this.#resyncTimer !== undefined) clearTimeout(this.#resyncTimer);
      this.#threads.stopAll();
    }
  }

  /**
   * A rejected credential or a defect ends the run; a closed or refused socket ends it through
   * its state change. Anything else is retried.
   */
  #endsRun(error: unknown): boolean {
    const ends =
      !(error instanceof T3Error) ||
      error instanceof T3AuthError ||
      (error instanceof T3RpcError && error.tag === "EnvironmentAuthorizationError");
    if (ends) this.#failure ??= { error };
    return ends;
  }

  #onSocketState(state: SocketState, error?: T3ConnectionError): void {
    const was = this.#socketState;
    this.#socketState = state;
    if (state === "closed") {
      this.#failure ??= {
        error: error ?? new T3ConnectionError("closed", "The connection was closed."),
      };
      return;
    }
    if (was !== "open" || state === "open") return;
    // Every live subscription resumes, and the run is not synchronized until a resync.
    this.#pending();
    if (this.#shellController !== undefined) this.#shellResuming = true;
    this.#threads.dropped();
  }

  #pending(): void {
    this.#ready = {
      item: this.#synchronizedSent ? "reconnected" : "synchronized",
      waiting: undefined,
    };
  }

  /** Reads the HTTP shell listing; the start's, or a resync's. */
  #startListing(): void {
    const generation = ++this.#shellGeneration;
    this.#shellController?.abort();
    this.#shellController = undefined;
    this.#shellResuming = false;
    this.#pending();
    this.#sources.shell.snapshot(this.#stop.signal).then(
      (snapshot) => this.#tasks.push(() => this.#onListing(generation, snapshot)),
      (error: unknown) =>
        this.#tasks.push(() => {
          if (generation !== this.#shellGeneration || this.#stop.signal.aborted) return;
          if (!this.#endsRun(error)) this.#resync(false);
        }),
    );
  }

  /** Starts a resync from a new HTTP shell listing, at once or after the backoff. */
  #resync(immediately: boolean): void {
    ++this.#shellGeneration;
    this.#shellController?.abort();
    this.#shellController = undefined;
    this.#pending();
    if (this.#resyncTimer !== undefined) clearTimeout(this.#resyncTimer);
    const delay = immediately ? 0 : this.#resyncBackoff.next();
    this.#resyncTimer = setTimeout(() => {
      this.#resyncTimer = undefined;
      this.#tasks.push(() => this.#startListing());
    }, delay);
  }

  #onListing(generation: number, snapshot: OrchestrationV2ShellSnapshot): void {
    if (generation !== this.#shellGeneration) return;
    const changed = this.#index.listing(snapshot);
    if (this.#listed) {
      for (const threadId of this.#index.removedIds()) this.#threads.recheck(threadId);
    }
    this.#listed = true;
    for (const threadId of changed) this.#threads.evaluate(threadId);
    this.#subscribe(generation, snapshot.snapshotSequence);
  }

  #subscribe(generation: number, afterSequence: number): void {
    const controller = new AbortController();
    this.#shellController = controller;
    const items = this.#sources.shell.watch({
      afterSequence,
      httpSnapshotFallback: true,
      signal: AbortSignal.any([this.#stop.signal, controller.signal]),
    });
    drain(
      items,
      (item) => this.#tasks.push(() => this.#onShellItem(generation, item)),
      (error) => this.#tasks.push(() => this.#onShellEnd(generation, error)),
    );
  }

  #onShellItem(generation: number, item: ShellWatchItem): void {
    if (generation !== this.#shellGeneration) return;
    switch (item.kind) {
      case "reconnected":
        this.#shellResuming = false;
        this.#pending();
        return;
      case "synchronized":
        if (this.#shellResuming) return;
        this.#fallbacks = 0;
        this.#resyncBackoff.reset();
        if (this.#ready !== undefined) this.#ready.waiting = new Set(this.#threads.busyThreads());
        return;
      case "snapshot-required":
        this.#resync(this.#fallbacks++ === 0);
        return;
      case "snapshot":
        this.#index.projects(item.snapshot.projects);
        return;
      case "project.updated":
        this.#index.projects([item.project]);
        return;
      case "project.removed":
        this.#index.projectRemoved(item.projectId);
        return;
      case "thread.updated":
        this.#index.row(item.thread);
        this.#threads.evaluate(item.thread.id);
        return;
      case "thread.removed":
        this.#index.removed(item.threadId);
        this.#threads.removal(item.threadId, item.sequence);
        return;
      case "decode-error":
        this.#out.push(item);
        return;
    }
  }

  #onShellEnd(generation: number, error: unknown): void {
    if (generation !== this.#shellGeneration || this.#stop.signal.aborted) return;
    if (error !== undefined && this.#endsRun(error)) return;
    this.#resync(false);
  }

  /** Yields the readiness item once the shell is synchronized and its busy threads are done. */
  #checkReady(): void {
    const ready = this.#ready;
    if (ready?.waiting === undefined) return;
    for (const threadId of ready.waiting) {
      if (!this.#threads.busy(threadId)) ready.waiting.delete(threadId);
    }
    if (ready.waiting.size > 0) return;
    this.#out.push({ kind: ready.item });
    if (ready.item === "synchronized") this.#synchronizedSent = true;
    this.#ready = undefined;
  }
}
