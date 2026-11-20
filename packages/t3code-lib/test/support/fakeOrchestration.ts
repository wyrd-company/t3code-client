/**
 * FakeOrchestration: the orchestration state a FakeT3Server serves to a request watch. It keeps
 * each thread's projection and one event sequence, and answers the HTTP shell listing, thread
 * detail, and shell and thread subscriptions the way upstream does: the shell batches a
 * thread's events for 50 ms into one row, holds back a row equal to the last one sent for five
 * seconds, publishes an archived or deleted thread as `thread.removed`, and answers a gap past
 * its replay limit with `snapshot-required`. Tests change threads through it.
 */
import { OrchestrationV2DomainEvent } from "../../src/schemas/orchestration/events.ts";
import type { OrchestrationV2ThreadProjection } from "../../src/schemas/orchestration/projection.ts";
import { applyThreadEvent } from "../../src/api/threadProjection.ts";
import type { FakeConnection, FakeT3Server } from "./fakeServer.ts";
import { FakeStreams } from "./fakeOrchestrationStreams.ts";
import {
  items,
  makeAppThread,
  makeProjection,
  makeRun,
  makeRuntimeRequest,
  makeShellProject,
  makeShellThread,
} from "./threadFixtures.ts";

export interface FakeThread {
  projection: OrchestrationV2ThreadProjection;
  /** The sequence of the thread's latest event. */
  latest: number;
  /** The server no longer holds the thread: subscriptions fail and detail answers 404. */
  forgotten: boolean;
}

export interface LoggedEvent {
  readonly sequence: number;
  readonly threadId: string;
  readonly raw: Record<string, unknown>;
}

export interface FakeOrchestrationOptions {
  /** Shell gaps longer than this many events answer `snapshot-required`. Default 1,000. */
  readonly shellReplayLimit?: number;
  /** Thread gaps longer than this many events get a snapshot. Default 1,000. */
  readonly threadReplayLimit?: number;
  /** The shell's hold-back of equal rows. Default 5,000 ms. */
  readonly holdBackMs?: number;
}

const time = (sequence: number) => new Date(Date.UTC(2020, 0, 1) + sequence * 1_000).toISOString();

export class FakeOrchestration {
  sequence = 0;
  readonly threads = new Map<string, FakeThread>();
  readonly projects = [makeShellProject()];
  readonly log: LoggedEvent[] = [];
  /** RPC methods called that a request watch must never call. */
  readonly forbidden: string[] = [];
  readonly streams: FakeStreams;

  constructor(options: FakeOrchestrationOptions = {}) {
    this.streams = new FakeStreams(this, options);
  }

  /** Serves this state from `server`; call again for a server restarted on the same port. */
  install(server: FakeT3Server): void {
    server.routes.route("POST /api/auth/websocket-ticket", () => ({
      status: 200,
      body: { ticket: server.issueTicket(), expiresAt: "2099-01-01T00:00:00.000Z" },
    }));
    server.routes.route("GET /api/orchestration/shell", () => ({
      status: 200,
      body: this.listing(),
    }));
    for (const threadId of this.threads.keys()) this.#detailRoute(server, threadId);
    this.#server = server;
    server.handle("orchestration.subscribeShell", (payload, context) =>
      this.streams.subscribeShell(payload, context.connection, context.requestId),
    );
    server.handle("orchestration.subscribeThread", (payload, context) =>
      this.streams.subscribeThread(payload, context.connection, context.requestId),
    );
    server.handle("orchestration.getArchivedShellSnapshot", () => {
      this.forbidden.push("orchestration.getArchivedShellSnapshot");
      return { kind: "die", defect: "The request watch must not read archived threads." };
    });
  }

  #server: FakeT3Server | undefined;

  #detailRoute(server: FakeT3Server, threadId: string): void {
    server.routes.route(`GET /api/orchestration/threads/${threadId}`, () => {
      const thread = this.threads.get(threadId);
      if (thread === undefined || thread.forgotten) {
        return { status: 404, body: { error: "not_found" } };
      }
      return {
        status: 200,
        body: { snapshotSequence: thread.latest, projection: thread.projection },
      };
    });
  }

  /** The HTTP shell listing: active threads only. */
  listing(): Record<string, unknown> {
    const threads = [...this.threads.values()]
      .filter((thread) => !thread.forgotten && !this.removed(thread))
      .map((thread) => this.row(thread));
    return {
      schemaVersion: 1,
      snapshotSequence: this.sequence,
      projects: this.projects,
      threads,
      archivedThreads: [],
    };
  }

  removed(thread: FakeThread): boolean {
    return (
      thread.projection.thread.archivedAt !== null || thread.projection.thread.deletedAt !== null
    );
  }

  /** The thread's shell row: its summary names approvals before questions, newest first. */
  row(thread: FakeThread): ReturnType<typeof makeShellThread> {
    const { projection } = thread;
    const pending = projection.runtimeRequests
      .filter((request) => request.status === "pending")
      .sort(
        (a, b) =>
          Number(a.kind === "user_input") - Number(b.kind === "user_input") ||
          b.createdAt.localeCompare(a.createdAt),
      );
    const summary = pending[0];
    const active = projection.runs.find((run) => run.status === "running");
    return makeShellThread({
      ...projection.thread,
      updatedAt: projection.updatedAt,
      status: active === undefined ? "idle" : "running",
      latestRunId: projection.runs.at(-1)?.id ?? null,
      activeRunId: active?.id ?? null,
      pendingRuntimeRequest:
        summary === undefined
          ? null
          : { id: summary.id, kind: summary.kind, createdAt: summary.createdAt },
    });
  }

  createThread(
    threadId: string,
    options: { projectId?: string; tags?: string[]; title?: string; parentThreadId?: string } = {},
  ): number {
    const record = makeAppThread({
      id: threadId,
      projectId: options.projectId ?? "project-1",
      title: options.title ?? `Thread ${threadId}`,
      tags: options.tags ?? [],
      lineage: {
        parentThreadId: options.parentThreadId ?? null,
        relationshipToParent: options.parentThreadId === undefined ? null : "subagent",
        rootThreadId: options.parentThreadId ?? threadId,
      },
    });
    this.threads.set(threadId, {
      projection: makeProjection({ thread: record }),
      latest: 0,
      forgotten: false,
    });
    if (this.#server !== undefined) this.#detailRoute(this.#server, threadId);
    return this.#emit(threadId, "thread.created", record);
  }

  /** A provider raises a request; its card follows unless `card` is false. */
  raise(
    threadId: string,
    requestId: string,
    options: { kind?: "command" | "user_input"; card?: boolean } = {},
  ): number {
    const kind = options.kind ?? "command";
    const sequence = this.#emit(
      threadId,
      "runtime-request.updated",
      makeRuntimeRequest(requestId, { kind, createdAt: time(this.sequence + 1) }),
    );
    return options.card === false ? sequence : this.card(threadId, requestId);
  }

  card(threadId: string, requestId: string): number {
    const request = this.#request(threadId, requestId);
    const make = request.kind === "user_input" ? items.userInputRequest : items.approvalRequest;
    return this.#emit(threadId, "turn-item.updated", make(requestId, { threadId }));
  }

  /** Repeats the request's record as it is, as a provider re-send or restart recovery does. */
  resend(threadId: string, requestId: string): number {
    return this.#emit(threadId, "runtime-request.updated", this.#request(threadId, requestId));
  }

  settle(threadId: string, requestId: string, status = "resolved"): number {
    const request = this.#request(threadId, requestId);
    return this.#emit(threadId, "runtime-request.updated", {
      ...request,
      status,
      resolvedAt: time(this.sequence + 1),
    });
  }

  run(threadId: string, runId: string, status: "running" | "completed"): number {
    const known = this.threads.get(threadId)?.projection.runs.some((run) => run.id === runId);
    return this.#emit(
      threadId,
      known === true ? "run.updated" : "run.created",
      makeRun({ id: runId, threadId, status, completedAt: status === "running" ? null : time(1) }),
    );
  }

  archive(threadId: string): number {
    return this.#state(threadId, "thread.archived", { archivedAt: time(this.sequence + 1) });
  }

  unarchive(threadId: string): number {
    return this.#state(threadId, "thread.unarchived", { archivedAt: null });
  }

  delete(threadId: string): number {
    return this.#state(threadId, "thread.deleted", { deletedAt: time(this.sequence + 1) });
  }

  setTags(threadId: string, tags: string[]): number {
    return this.#state(threadId, "thread.tags-updated", { tags });
  }

  /** Any event of the thread that changes nothing a request watch reads. */
  touch(threadId: string): number {
    return this.#state(threadId, "thread.metadata-updated", {});
  }

  #state(threadId: string, type: string, change: Record<string, unknown>): number {
    const thread = this.#thread(threadId);
    return this.#emit(threadId, type, { ...thread.projection.thread, ...change });
  }

  #thread(threadId: string): FakeThread {
    const thread = this.threads.get(threadId);
    if (thread === undefined) throw new Error(`No fake thread ${threadId}.`);
    return thread;
  }

  #request(threadId: string, requestId: string) {
    const request = this.#thread(threadId).projection.runtimeRequests.find(
      (candidate) => candidate.id === requestId,
    );
    if (request === undefined) throw new Error(`No fake request ${requestId}.`);
    return request;
  }

  #emit(threadId: string, type: string, payload: Record<string, unknown>): number {
    const sequence = ++this.sequence;
    const raw = { id: `event-${sequence}`, threadId, occurredAt: time(sequence), type, payload };
    const thread = this.#thread(threadId);
    thread.projection = applyThreadEvent(thread.projection, OrchestrationV2DomainEvent.parse(raw));
    thread.latest = sequence;
    const event = { sequence, threadId, raw };
    this.log.push(event);
    this.streams.publish(event);
    return sequence;
  }
}

export type { FakeConnection };
