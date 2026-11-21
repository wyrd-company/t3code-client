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
   * Every selected request the watch sees pending, once per run. Read-only.
   *
   * Options, each optional; with none, every request of every thread is selected:
   * - `projectIds`: only threads in these projects.
   * - `kind`: `"approval"` or `"user-input"`, only requests of this kind.
   * - `excludeThreadIds`: never the threads with exactly these ids. A subagent thread has its
   *   own id, so excluding a manager does not exclude its workers.
   * - `excludeTags`: never the threads that carry one of these tags, compared after trimming.
   * - `signal`: aborting it ends the iteration quietly and stops every subscription at once.
   *
   * The filters are checked again on the thread record of the view that holds a request just
   * before it is reported. A malformed option (an empty id, an unknown kind, a tag that is not a
   * single line of at most 64 characters) raises `T3PreconditionError` before anything is
   * subscribed.
   *
   * Items, by `kind`:
   * - `request`: `request` is a `ReportedRequest`, the `PendingRequest` that
   *   `threads.pendingRequests` returns (`kind`, `requestId`, the runtime `request` record, its
   *   timeline card `item` or `undefined`, and `questions` for a question) plus
   *   `thread: { id, title, tags }` and `project: { id, title }`, where `title` is null until
   *   the watch has seen the project. `request.status` is `pending`, or the settled status of a
   *   request that settled while its report waited up to two seconds for its card.
   * - `synchronized`: once, after every request pending at the start has been reported.
   * - `reconnected`: after each resync (a dropped socket, a server restart, a gap the server
   *   cannot replay), once every request pending then has been reported.
   * - `thread-error`: `threadId` and `error`, a thread watch that failed and is retried.
   * - `decode-error`: `error`, a shell or thread item this client could not decode.
   *
   * Every thread is covered, including threads created and archived while the watch runs, and
   * a request raised during an outage that is still pending at the reconnect. Not reported: a
   * request that settles before the watch sees it pending, settled history, and requests
   * already pending in archived threads at the start. `client.close()` and a rejected
   * credential end the iteration with their error; every other failure is retried with the
   * transport's backoff.
   */
  watch(options: RequestWatchOptions = {}): AsyncIterable<RequestWatchItem> {
    return watchRequests(this.#sources, checkFilters(options), options.signal);
  }
}
