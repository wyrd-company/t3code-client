// ---
// relationships:
//   implements: request-watch
// ---
/**
 * The thread watches of one request watch run (`request-watch` design, `watching`): one per
 * thread that needs watching, each with its view, its outstanding removal and recheck, and its
 * retries. The run calls in from its task loop; nothing here runs concurrently with it.
 */
import { T3ConnectionError, T3NotFoundError, type T3Error } from "../errors.ts";
import { drain } from "../internal/asyncIterable.ts";
import { createBackoff, type Backoff, type BackoffPolicy } from "../internal/backoff.ts";
import type { ThreadId } from "../schemas/common.ts";
import type { OrchestrationV2ThreadProjection } from "../schemas/orchestration/projection.ts";
import {
  excludedById,
  needsThreadWatch,
  type RequestFilters,
  type RequestIndex,
} from "./requestIndex.ts";
import { CardWaits, type RequestReports, type ReportedRequest } from "./requestReports.ts";
import { applyThreadEvent } from "./threadProjection.ts";
import type { ThreadWatchItem, ThreadWatchOptions } from "./threadWatch.ts";

/** What the thread watches need from the run. */
export interface ThreadWatchHost {
  readonly filters: RequestFilters;
  readonly index: RequestIndex;
  readonly reports: RequestReports;
  readonly signal: AbortSignal;
  readonly backoff: BackoffPolicy | undefined;
  readonly cardWaitMs: number;
  watch(threadId: ThreadId, options: ThreadWatchOptions): AsyncIterable<ThreadWatchItem>;
  detail(threadId: ThreadId, signal: AbortSignal): Promise<unknown>;
  /** Runs `task` in the run's task loop. */
  schedule(task: () => void): void;
  /** Ends the run when `error` is one that ends it; returns whether it did. */
  endsRun(error: unknown): boolean;
  report(request: ReportedRequest): void;
  threadError(threadId: ThreadId, error: T3Error): void;
  decodeError(item: Extract<ThreadWatchItem, { kind: "decode-error" }>): void;
}

interface Watch {
  /** The subscription attempt; 0 while the watch waits to subscribe again. */
  attempt: number;
  controller: AbortController;
  /** Delivered `synchronized` since it last subscribed or resumed. */
  caughtUp: boolean;
  /** The socket dropped; items until the resumed subscription's `reconnected` are old. */
  resuming: boolean;
  /** Between a subscription's first item or `reconnected` and its marker: views are not current. */
  replaying: boolean;
  retry: ReturnType<typeof setTimeout> | undefined;
}

interface Track {
  readonly threadId: ThreadId;
  /** The highest removal sequence no view has reached. */
  removal: number | undefined;
  /** A recheck waits for the first snapshot of this attempt or a later one. */
  recheckFrom: number | undefined;
  watch: Watch | undefined;
  view: OrchestrationV2ThreadProjection | undefined;
  viewSequence: number;
  /** Card waits that ran out during a replay; they end at its marker. */
  readonly due: Set<string>;
  readonly backoff: Backoff;
}

function newWatch(): Watch {
  return {
    attempt: 0,
    controller: new AbortController(),
    caughtUp: false,
    resuming: false,
    replaying: false,
    retry: undefined,
  };
}

export class ThreadWatches {
  readonly #host: ThreadWatchHost;
  readonly #tracks = new Map<ThreadId, Track>();
  readonly #cardWaits = new CardWaits();
  #attempts = 0;

  constructor(host: ThreadWatchHost) {
    this.#host = host;
  }

  /** A thread needs watching, holds an obligation, or waits for a card or its marker. */
  busy(threadId: ThreadId): boolean {
    const track = this.#tracks.get(threadId);
    if (track === undefined) return false;
    return (
      (track.watch !== undefined && !track.watch.caughtUp) ||
      track.removal !== undefined ||
      track.recheckFrom !== undefined ||
      this.#host.reports.waiting(threadId)
    );
  }

  busyThreads(): ThreadId[] {
    return [...this.#tracks.keys()].filter((threadId) => this.busy(threadId));
  }

  /** Opens or closes the thread's watch as the watch rule says. */
  evaluate(threadId: ThreadId): void {
    const track = this.#tracks.get(threadId);
    if (track?.watch === undefined) {
      // A card wait keeps a watch open; it does not open one, and reports from the last view.
      if (!this.#needs(threadId, track, false)) return;
      const opened = this.#track(threadId);
      opened.watch = newWatch();
      this.#subscribe(opened, opened.watch);
      return;
    }
    if (this.#needs(threadId, track)) return;
    if (track.watch.attempt === 0 || track.watch.caughtUp) this.#close(track);
  }

  /** A `thread.removed`, live or in a catch-up. */
  removal(threadId: ThreadId, sequence: number): void {
    if (!excludedById(this.#host.filters, threadId)) {
      const track = this.#track(threadId);
      track.removal = Math.max(track.removal ?? 0, sequence);
      this.#answerRemoval(track);
    }
    this.evaluate(threadId);
  }

  /** A resync's listing: the thread is looked at again by a subscription made after it. */
  recheck(threadId: ThreadId): void {
    if (excludedById(this.#host.filters, threadId)) return;
    const track = this.#track(threadId);
    if (track.watch !== undefined) this.#stop(track.watch);
    track.watch = newWatch();
    track.recheckFrom = this.#subscribe(track, track.watch);
  }

  /** The socket dropped: every live subscription resumes and must deliver its marker again. */
  dropped(): void {
    for (const track of this.#tracks.values()) {
      const watch = track.watch;
      if (watch === undefined || watch.attempt === 0) continue;
      watch.caughtUp = false;
      watch.resuming = true;
    }
  }

  /** Stops every watch and timer. */
  stopAll(): void {
    for (const track of this.#tracks.values()) if (track.watch) this.#stop(track.watch);
    this.#cardWaits.clear();
  }

  #track(threadId: ThreadId): Track {
    let track = this.#tracks.get(threadId);
    if (track === undefined) {
      track = {
        threadId,
        removal: undefined,
        recheckFrom: undefined,
        watch: undefined,
        view: undefined,
        viewSequence: 0,
        due: new Set(),
        backoff: createBackoff(this.#host.backoff),
      };
      this.#tracks.set(threadId, track);
    }
    return track;
  }

  /** Every condition of the watch rule but the wait for `synchronized`. */
  #needs(threadId: ThreadId, track: Track | undefined, cardWait = true): boolean {
    return needsThreadWatch(this.#host.filters, {
      thread: this.#host.index.get(threadId),
      view: track?.view,
      outstanding: track?.removal !== undefined || track?.recheckFrom !== undefined,
      cardWait: cardWait && this.#host.reports.waiting(threadId),
    });
  }

  #subscribe(track: Track, watch: Watch): number {
    const attempt = ++this.#attempts;
    watch.attempt = attempt;
    watch.caughtUp = false;
    watch.resuming = false;
    watch.replaying = false;
    const signal = AbortSignal.any([this.#host.signal, watch.controller.signal]);
    const items = this.#host.watch(track.threadId, {
      acceptBoundedSnapshot: true,
      acceptCompactTurnItems: true,
      signal,
    });
    drain(
      items,
      (item) => this.#host.schedule(() => this.#onItem(track, attempt, item)),
      (error) => this.#host.schedule(() => this.#onEnd(track, attempt, error)),
    );
    return attempt;
  }

  #stop(watch: Watch): void {
    watch.controller.abort();
    if (watch.retry !== undefined) clearTimeout(watch.retry);
    watch.retry = undefined;
    watch.attempt = 0;
  }

  #close(track: Track): void {
    if (track.watch) this.#stop(track.watch);
    track.watch = undefined;
    track.view = undefined;
    track.viewSequence = 0;
  }

  #onItem(track: Track, attempt: number, item: ThreadWatchItem): void {
    const watch = track.watch;
    if (watch === undefined || watch.attempt !== attempt) return;
    switch (item.kind) {
      case "snapshot":
        if (!watch.caughtUp && !watch.resuming) watch.replaying = true;
        track.view = item.snapshot.projection;
        track.viewSequence = item.snapshot.snapshotSequence;
        if (track.recheckFrom !== undefined && attempt >= track.recheckFrom) {
          track.recheckFrom = undefined;
        }
        this.#viewChanged(track);
        break;
      case "event":
        if (!watch.caughtUp && !watch.resuming) watch.replaying = true;
        if (track.view === undefined) break;
        track.view = applyThreadEvent(track.view, item.event);
        track.viewSequence = Math.max(track.viewSequence, item.sequence);
        this.#viewChanged(track);
        break;
      case "synchronized":
        if (watch.resuming) break;
        watch.caughtUp = true;
        watch.replaying = false;
        track.backoff.reset();
        this.#viewChanged(track);
        this.#finishDue(track);
        break;
      case "reconnected":
        watch.resuming = false;
        watch.caughtUp = false;
        watch.replaying = true;
        break;
      case "decode-error":
        this.#host.decodeError(item);
        break;
      default:
        break;
    }
    this.evaluate(track.threadId);
  }

  #answerRemoval(track: Track): void {
    if (track.removal !== undefined && track.viewSequence >= track.removal) {
      track.removal = undefined;
    }
  }

  /**
   * Answers removals the view reached, and reads it for requests only once its subscription has
   * caught up: a replay's intermediate views can hold a request that settled later in the gap.
   */
  #viewChanged(track: Track): void {
    this.#answerRemoval(track);
    const view = track.view;
    if (view === undefined || track.watch?.caughtUp !== true) return;
    const { reports, filters, cardWaitMs } = this.#host;
    const { seen, ready } = reports.read(track.threadId, view, filters);
    for (const { key } of seen) {
      this.#cardWaits.start(key, track.threadId, cardWaitMs, () => {
        this.#host.schedule(() => {
          if (track.watch?.replaying === true) {
            track.due.add(key);
            return;
          }
          this.#finish(key);
          this.evaluate(track.threadId);
        });
      });
    }
    for (const { key } of ready) this.#finish(key);
  }

  /** Ends the card waits that ran out while the watch replayed. */
  #finishDue(track: Track): void {
    for (const key of track.due) this.#finish(key);
    track.due.clear();
  }

  /** Ends a request's card wait, with the latest view of its thread. */
  #finish(key: string): void {
    const threadId = this.#cardWaits.stop(key);
    if (threadId === undefined) return;
    const view = this.#tracks.get(threadId)?.view;
    const { reports, filters, index } = this.#host;
    const request = reports.finish(key, view, filters, (id) => index.projectTitle(id));
    if (request !== undefined) this.#host.report(request);
  }

  #onEnd(track: Track, attempt: number, error: unknown): void {
    const watch = track.watch;
    if (watch === undefined || watch.attempt !== attempt || this.#host.signal.aborted) return;
    if (error !== undefined) {
      if (this.#host.endsRun(error)) return;
      this.#host.threadError(track.threadId, error as T3Error);
    }
    watch.attempt = 0;
    watch.caughtUp = false;
    watch.resuming = false;
    watch.replaying = false;
    this.#finishDue(track);
    const removed = this.#host.index.get(track.threadId)?.location === "removed";
    if (removed && error !== undefined && !(error instanceof T3ConnectionError)) {
      this.#host.detail(track.threadId, this.#host.signal).then(
        () => this.#host.schedule(() => this.#retry(track, watch)),
        (detailError: unknown) =>
          this.#host.schedule(() => {
            if (track.watch !== watch || this.#host.signal.aborted) return;
            if (detailError instanceof T3NotFoundError) {
              // The server holds no such thread: its view is gone with it. Card waits already
              // started still report, from the last record they held.
              track.removal = undefined;
              track.recheckFrom = undefined;
              this.#close(track);
              this.evaluate(track.threadId);
              return;
            }
            if (this.#host.endsRun(detailError)) return;
            this.#retry(track, watch);
          }),
      );
      return;
    }
    this.#retry(track, watch);
  }

  /** Subscribes again with backoff while the thread still needs watching. */
  #retry(track: Track, watch: Watch): void {
    if (track.watch !== watch) return;
    if (!this.#needs(track.threadId, track)) {
      this.#close(track);
      return;
    }
    watch.retry = setTimeout(() => {
      this.#host.schedule(() => {
        if (track.watch !== watch) return;
        watch.retry = undefined;
        if (this.#needs(track.threadId, track)) this.#subscribe(track, watch);
        else this.#close(track);
      });
    }, track.backoff.next());
  }
}
