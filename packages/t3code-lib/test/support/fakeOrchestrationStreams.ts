/**
 * The shell and thread subscriptions of a FakeOrchestration, with upstream's 50 ms shell batch,
 * hold-back of equal rows, replay limits and completion markers.
 */
import type { FakeRpcResponse } from "./fakeServer.ts";
import type {
  FakeConnection,
  FakeOrchestration,
  FakeOrchestrationOptions,
  FakeThread,
  LoggedEvent,
} from "./fakeOrchestration.ts";

interface Subscription {
  readonly connection: FakeConnection;
  readonly requestId: string;
}

interface ShellSubscription extends Subscription {
  /** The last row sent per thread, `updatedAt` masked, and when it was sent. */
  readonly rows: Map<string, { readonly key: string; readonly at: number }>;
  /** Threads changed in the current batch, with their latest sequence. */
  readonly dirty: Map<string, number>;
  timer: ReturnType<typeof setTimeout> | undefined;
}

interface ThreadSubscription extends Subscription {
  readonly threadId: string;
}

const failure = (threadId: string): FakeRpcResponse => ({
  kind: "fail",
  error: {
    _tag: "OrchestrationV2GetThreadProjectionError",
    threadId,
    message: `Failed to load orchestration V2 thread ${threadId}`,
  },
});

export class FakeStreams {
  readonly #state: FakeOrchestration;
  readonly #shellLimit: number;
  readonly #threadLimit: number;
  readonly #holdBackMs: number;
  #shells: ShellSubscription[] = [];
  #threads: ThreadSubscription[] = [];
  /** Threads whose live events are held back from their subscriptions until `release`. */
  readonly #paused = new Map<string, LoggedEvent[]>();
  /** Subscription failures still to inject per thread. */
  readonly threadFailures = new Map<string, number>();
  readonly shellPayloads: Record<string, unknown>[] = [];
  readonly threadPayloads: Record<string, unknown>[] = [];

  constructor(state: FakeOrchestration, options: FakeOrchestrationOptions) {
    this.#state = state;
    this.#shellLimit = options.shellReplayLimit ?? 1_000;
    this.#threadLimit = options.threadReplayLimit ?? 1_000;
    this.#holdBackMs = options.holdBackMs ?? 5_000;
  }

  get liveShells(): number {
    return this.#live(this.#shells).length;
  }

  get liveThreads(): number {
    return this.#live(this.#threads).length;
  }

  threadSubscriptions(threadId: string): number {
    return this.threadPayloads.filter((payload) => payload["threadId"] === threadId).length;
  }

  subscribeShell(payload: unknown, connection: FakeConnection, requestId: string): FakeRpcResponse {
    const input = payload as { afterSequence?: number; httpSnapshotFallback?: boolean };
    this.shellPayloads.push(payload as Record<string, unknown>);
    const after = input.afterSequence;
    const replayable =
      after !== undefined &&
      after <= this.#state.sequence &&
      this.#state.sequence - after <= this.#shellLimit;
    if (after !== undefined && !replayable && input.httpSnapshotFallback === true) {
      connection.send({ _tag: "Chunk", requestId, values: [{ kind: "snapshot-required" }] });
      connection.send({ _tag: "Exit", requestId, exit: { _tag: "Success", value: null } });
      return { kind: "hang" };
    }
    const subscription: ShellSubscription = {
      connection,
      requestId,
      rows: new Map(),
      dirty: new Map(),
      timer: undefined,
    };
    const values: unknown[] = [];
    if (after === undefined || !replayable) {
      values.push({ kind: "snapshot", snapshot: this.#state.listing() });
    } else {
      const latest = new Map<string, number>();
      for (const event of this.#state.log) {
        if (event.sequence > after) latest.set(event.threadId, event.sequence);
      }
      for (const [threadId, sequence] of [...latest].sort((a, b) => a[1] - b[1])) {
        values.push(this.#shellItem(subscription, threadId, sequence, false));
      }
    }
    values.push({ kind: "synchronized" });
    connection.send({ _tag: "Chunk", requestId, values: values.filter(Boolean) });
    this.#shells.push(subscription);
    return { kind: "hang" };
  }

  subscribeThread(
    payload: unknown,
    connection: FakeConnection,
    requestId: string,
  ): FakeRpcResponse {
    const input = payload as { threadId: string; afterSequence?: number };
    this.threadPayloads.push(payload as Record<string, unknown>);
    const { threadId } = input;
    const failures = this.threadFailures.get(threadId) ?? 0;
    if (failures > 0) {
      this.threadFailures.set(threadId, failures - 1);
      return failure(threadId);
    }
    const thread = this.#state.threads.get(threadId);
    if (thread === undefined || thread.forgotten) return failure(threadId);
    const after = input.afterSequence;
    const missed = this.#state.log.filter(
      (event) => event.threadId === threadId && after !== undefined && event.sequence > after,
    );
    const values: unknown[] =
      after === undefined || missed.length > this.#threadLimit
        ? [this.#snapshot(thread)]
        : missed.map((event) => ({ kind: "event", sequence: event.sequence, event: event.raw }));
    values.push({ kind: "synchronized" });
    connection.send({ _tag: "Chunk", requestId, values });
    this.#threads.push({ connection, requestId, threadId });
    return { kind: "hang" };
  }

  /** Ends every live shell subscription with a server failure. */
  failShells(): void {
    for (const shell of this.#live(this.#shells)) {
      shell.connection.send({
        _tag: "Exit",
        requestId: shell.requestId,
        exit: {
          _tag: "Failure",
          cause: [
            {
              _tag: "Fail",
              error: { _tag: "OrchestrationV2GetShellSnapshotError", message: "Sample failure." },
            },
          ],
        },
      });
    }
    this.#shells = [];
  }

  /** Holds the thread's live events back from its subscriptions. */
  pause(threadId: string): void {
    this.#paused.set(threadId, this.#paused.get(threadId) ?? []);
  }

  release(threadId: string): void {
    const held = this.#paused.get(threadId) ?? [];
    this.#paused.delete(threadId);
    for (const event of held) this.#sendThreadEvent(event);
  }

  publish(event: LoggedEvent): void {
    const held = this.#paused.get(event.threadId);
    if (held === undefined) this.#sendThreadEvent(event);
    else held.push(event);
    for (const shell of this.#live(this.#shells)) {
      shell.dirty.set(event.threadId, event.sequence);
      shell.timer ??= setTimeout(() => this.#flush(shell), 50);
    }
  }

  #sendThreadEvent(event: LoggedEvent): void {
    this.#threads = this.#live(this.#threads);
    for (const thread of this.#threads) {
      if (thread.threadId !== event.threadId) continue;
      thread.connection.send({
        _tag: "Chunk",
        requestId: thread.requestId,
        values: [{ kind: "event", sequence: event.sequence, event: event.raw }],
      });
    }
  }

  #flush(shell: ShellSubscription): void {
    shell.timer = undefined;
    if (!this.#alive(shell)) return;
    const values = [...shell.dirty]
      .sort((a, b) => a[1] - b[1])
      .map(([threadId, sequence]) => this.#shellItem(shell, threadId, sequence, true))
      .filter(Boolean);
    shell.dirty.clear();
    if (values.length > 0) {
      shell.connection.send({ _tag: "Chunk", requestId: shell.requestId, values });
    }
  }

  /** A row, a removal, or nothing for a row held back as equal to the last one sent. */
  #shellItem(
    shell: ShellSubscription,
    threadId: string,
    sequence: number,
    holdBack: boolean,
  ): Record<string, unknown> | undefined {
    const thread = this.#state.threads.get(threadId) as FakeThread;
    if (thread.forgotten || this.#state.removed(thread)) {
      shell.rows.delete(threadId);
      return { kind: "thread.removed", sequence, location: "active", threadId };
    }
    const row = this.#state.row(thread);
    const key = JSON.stringify({ ...row, updatedAt: "" });
    const last = shell.rows.get(threadId);
    const now = Date.now();
    if (holdBack && last?.key === key && now - last.at < this.#holdBackMs) return undefined;
    shell.rows.set(threadId, { key, at: now });
    return { kind: "thread.updated", sequence, location: "active", thread: row };
  }

  #snapshot(thread: FakeThread): Record<string, unknown> {
    return { kind: "snapshot", snapshotSequence: thread.latest, projection: thread.projection };
  }

  #alive(subscription: Subscription): boolean {
    return (
      subscription.connection.open &&
      !subscription.connection.interrupts.includes(subscription.requestId)
    );
  }

  #live<T extends Subscription>(subscriptions: T[]): T[] {
    return subscriptions.filter((subscription) => this.#alive(subscription));
  }
}
