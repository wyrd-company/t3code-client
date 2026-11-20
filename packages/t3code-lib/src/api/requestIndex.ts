// ---
// relationships:
//   implements: request-watch
// ---
/**
 * The request watch's index of threads and projects, its option checks, and the
 * inclusion and watch rules (`request-watch` design, `watching`). Pure functions
 * and plain state; no I/O.
 */
import type { z } from "zod";
import { T3PreconditionError } from "../errors.ts";
import { ProjectId, ThreadId } from "../schemas/common.ts";
import type { OrchestrationV2ThreadProjection } from "../schemas/orchestration/projection.ts";
import { isRunTerminalStatus } from "../schemas/orchestration/runs.ts";
import type {
  OrchestrationProjectShell,
  OrchestrationV2ShellSnapshot,
  OrchestrationV2ThreadShell,
} from "../schemas/orchestration/shell.ts";
import { ThreadTag } from "../schemas/orchestration/threadTags.ts";
import { pendingRequests, type PendingRequest } from "./threadDerived.ts";

export type PendingRequestKind = PendingRequest["kind"];

/** Which requests a watch reports. Every filter is optional; none selects every request. */
export interface RequestWatchFilters {
  /** Only threads in these projects. */
  readonly projectIds?: readonly ProjectId[];
  /** Only requests of this kind. */
  readonly kind?: PendingRequestKind;
  /** Never the threads with exactly these ids. */
  readonly excludeThreadIds?: readonly ThreadId[];
  /** Never the threads that carry one of these tags. */
  readonly excludeTags?: readonly string[];
}

/** Checked filters. An empty `projectIds` set selects every project. */
export interface RequestFilters {
  readonly projectIds: ReadonlySet<string>;
  readonly kind: PendingRequestKind | undefined;
  readonly excludeThreadIds: ReadonlySet<string>;
  readonly excludeTags: ReadonlySet<string>;
}

const kinds: ReadonlySet<unknown> = new Set<PendingRequestKind>(["approval", "user-input"]);

/** Checks the filters; a malformed one raises `T3PreconditionError`. */
export function checkFilters(options: RequestWatchFilters): RequestFilters {
  const kind: unknown = options.kind;
  if (kind !== undefined && !kinds.has(kind)) {
    throw new T3PreconditionError(`Request kind must be approval or user-input: ${String(kind)}.`);
  }
  return {
    projectIds: checkedSet("projectIds", options.projectIds, ProjectId),
    kind: kind as PendingRequestKind | undefined,
    excludeThreadIds: checkedSet("excludeThreadIds", options.excludeThreadIds, ThreadId),
    excludeTags: checkedSet("excludeTags", options.excludeTags, ThreadTag),
  };
}

function checkedSet(name: string, values: unknown, schema: z.ZodType<string>): Set<string> {
  if (values === undefined) return new Set();
  if (!Array.isArray(values)) throw new T3PreconditionError(`${name} must be an array.`);
  return new Set(
    values.map((value: unknown) => {
      const parsed = schema.safeParse(value);
      if (!parsed.success) {
        throw new T3PreconditionError(`${name} holds an invalid value: ${JSON.stringify(value)}.`);
      }
      return parsed.data;
    }),
  );
}

/** The parts of a thread record or row that the filters read. */
export interface ThreadFacts {
  readonly id: string;
  readonly projectId: string | undefined;
  readonly tags?: readonly string[] | undefined;
}

/** Excluded by exact id: such a thread gets no thread watch, removal or recheck. */
export function excludedById(filters: RequestFilters, threadId: string): boolean {
  return filters.excludeThreadIds.has(threadId);
}

/** Not excluded by id or by one of its own tags, and in a selected project. */
export function isIncluded(filters: RequestFilters, thread: ThreadFacts): boolean {
  if (excludedById(filters, thread.id)) return false;
  if ((thread.tags ?? []).some((tag) => filters.excludeTags.has(tag.trim()))) return false;
  if (filters.projectIds.size === 0) return true;
  return thread.projectId !== undefined && filters.projectIds.has(thread.projectId);
}

/** A request of the selected kind in an included thread record. */
export function isSelected(
  filters: RequestFilters,
  request: PendingRequest,
  thread: ThreadFacts,
): boolean {
  return (
    (filters.kind === undefined || request.kind === filters.kind) && isIncluded(filters, thread)
  );
}

export interface IndexedThread extends ThreadFacts {
  readonly id: ThreadId;
  readonly location: "active" | "removed";
  readonly projectId: ProjectId | undefined;
  readonly tags: readonly string[];
  /** The latest row showed a pending summary. */
  readonly hasSummary: boolean;
}

/** What the run knows of each thread and project it has met. */
export class RequestIndex {
  readonly #threads = new Map<ThreadId, IndexedThread>();
  readonly #projectTitles = new Map<string, string>();

  get(threadId: ThreadId): IndexedThread | undefined {
    return this.#threads.get(threadId);
  }

  /** Thread ids held as removed. */
  removedIds(): ThreadId[] {
    return [...this.#threads.values()].filter((t) => t.location === "removed").map((t) => t.id);
  }

  /** A `thread.updated` row, or a row of a listing: the thread is active. */
  row(thread: OrchestrationV2ThreadShell): IndexedThread {
    const entry: IndexedThread = {
      id: thread.id,
      location: "active",
      projectId: thread.projectId,
      tags: thread.tags ?? [],
      hasSummary: thread.pendingRuntimeRequest !== null,
    };
    this.#threads.set(thread.id, entry);
    return entry;
  }

  /** A `thread.removed`: archived or deleted. The latest row's project and tags are kept. */
  removed(threadId: ThreadId): IndexedThread {
    const known = this.#threads.get(threadId);
    const entry: IndexedThread = {
      id: threadId,
      location: "removed",
      projectId: known?.projectId,
      tags: known?.tags ?? [],
      hasSummary: false,
    };
    this.#threads.set(threadId, entry);
    return entry;
  }

  /**
   * An HTTP shell listing: every listed thread is active with its row, and a thread held as
   * active that the listing leaves out is removed. Returns the threads whose entry changed.
   */
  listing(snapshot: OrchestrationV2ShellSnapshot): ThreadId[] {
    const listed = new Set<ThreadId>();
    for (const thread of snapshot.threads) {
      this.row(thread);
      listed.add(thread.id);
    }
    const left: ThreadId[] = [];
    for (const thread of this.#threads.values()) {
      if (thread.location !== "active" || listed.has(thread.id)) continue;
      this.removed(thread.id);
      left.push(thread.id);
    }
    this.projects(snapshot.projects);
    return [...listed, ...left];
  }

  projects(projects: readonly OrchestrationProjectShell[]): void {
    for (const project of projects) this.#projectTitles.set(project.id, project.title);
  }

  projectRemoved(projectId: string): void {
    this.#projectTitles.delete(projectId);
  }

  /** The project's name, or null while the run has not seen the project. */
  projectTitle(projectId: string): string | null {
    return this.#projectTitles.get(projectId) ?? null;
  }
}

/** What the watch rule reads for one thread. */
export interface WatchFacts {
  readonly thread: IndexedThread | undefined;
  readonly view: OrchestrationV2ThreadProjection | undefined;
  /** A removal or a recheck of the thread is outstanding. */
  readonly outstanding: boolean;
  /** A request seen pending in the thread waits for its card. */
  readonly cardWait: boolean;
}

/**
 * Every condition of the watch rule but the wait for `synchronized`: a thread without a thread
 * watch gets one, and an open one stays open, while this holds.
 */
export function needsThreadWatch(filters: RequestFilters, facts: WatchFacts): boolean {
  const { thread, view } = facts;
  if (facts.outstanding || facts.cardWait) return true;
  if (thread?.location === "active" && thread.hasSummary && isIncluded(filters, thread)) {
    return true;
  }
  if (view === undefined) return false;
  const record = view.thread;
  if (pendingRequests(view).some((request) => isSelected(filters, request, record))) return true;
  return (
    thread?.location === "removed" &&
    isIncluded(filters, record) &&
    view.runs.some((run) => !isRunTerminalStatus(run.status))
  );
}
