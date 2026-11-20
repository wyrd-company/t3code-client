// ---
// relationships:
//   implements: request-watch
// ---
/**
 * RequestsApi: the approvals and questions a server's threads hold pending, as one watch over
 * the shell and thread facades. Read-only: answering stays with `threads.respondToApproval`,
 * `threads.respondToUserInput` and `t3c thread respond`.
 */
import { checkFilters, type RequestWatchFilters } from "./requestIndex.ts";
import { watchRequests, type RequestWatchItem, type RequestWatchSources } from "./requestWatch.ts";

export type { PendingRequestKind, RequestWatchFilters } from "./requestIndex.ts";
export type { ReportedRequest } from "./requestReports.ts";
export type { RequestWatchItem } from "./requestWatch.ts";

export interface RequestWatchOptions extends RequestWatchFilters {
  readonly signal?: AbortSignal;
}

/**
 * The approvals and questions a server's threads hold pending, as one read-only watch over the
 * shell and thread watches. Answering stays with `threads.respondToApproval`,
 * `threads.respondToUserInput` and `t3c thread respond`.
 */
export class RequestsApi {
  readonly #sources: RequestWatchSources;

  constructor(sources: RequestWatchSources) {
    this.#sources = sources;
  }

  /**
   * Every selected request the watch sees pending, once per run, with `synchronized` once the
   * start's reports are out and `reconnected` after each resync's. Every thread is covered,
   * including threads created and archived while the watch runs; requests already pending in
   * archived threads at the start are not. A request that settles before the watch sees it
   * pending is not reported. Raises `T3PreconditionError` for a malformed option before it
   * subscribes. Aborting `signal` ends the iteration quietly; `client.close()` and a rejected
   * credential end it with their error, and every other failure is retried with the
   * transport's backoff.
   */
  watch(options: RequestWatchOptions = {}): AsyncIterable<RequestWatchItem> {
    return watchRequests(this.#sources, checkFilters(options), options.signal);
  }
}
