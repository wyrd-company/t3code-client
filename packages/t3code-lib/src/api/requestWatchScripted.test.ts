// ---
// relationships:
//   verifies: request-watch
// ---
/**
 * The request watch over scripted sources, for orderings a server cannot be made to produce on
 * demand: a replay that ends a run before it raises a request, and a marker buffered before a
 * socket drop.
 */
import { describe, expect, it } from "vite-plus/test";
import {
  items,
  makeAppThread,
  makeProjection,
  makeRuntimeRequest,
  makeShellSnapshot,
  makeShellThread,
  eventItem,
  parseEvent,
} from "../../test/support/threadFixtures.ts";
import { until } from "../../test/support/requestWatchHarness.ts";
import { createChannel, type Channel } from "../internal/asyncIterable.ts";
import type { ThreadId } from "../schemas/common.ts";
import type { OrchestrationV2ShellSnapshot } from "../schemas/orchestration/shell.ts";
import type { SocketState } from "../transport/socket.ts";
import { checkFilters } from "./requestIndex.ts";
import { watchRequests, type RequestWatchItem } from "./requestWatch.ts";
import type { ShellWatchItem } from "./shell.ts";
import type { ThreadWatchItem } from "./threadWatch.ts";

const at = (second: number) => new Date(Date.UTC(2020, 0, 1, 0, 0, second)).toISOString();
const request = (id: string, status = "pending") =>
  makeRuntimeRequest(id, { createdAt: at(Number(id.slice(-1))), status });
const event = (sequence: number, type: string, payload: Record<string, unknown>) => {
  const raw = eventItem(sequence, type, payload) as { event: Record<string, unknown> };
  return { kind: "event", sequence, event: parseEvent(raw.event) } as const;
};

function scripted(listing: OrchestrationV2ShellSnapshot) {
  const shell = createChannel<ShellWatchItem>();
  const threads = new Map<ThreadId, Channel<ThreadWatchItem>[]>();
  let stateHandler: ((state: SocketState) => void) | undefined;
  const controller = new AbortController();
  const out: RequestWatchItem[] = [];
  const run = watchRequests(
    {
      shell: { snapshot: async () => listing, watch: () => shell },
      threads: {
        watch: (threadId) => {
          const channel = createChannel<ThreadWatchItem>();
          threads.set(threadId, [...(threads.get(threadId) ?? []), channel]);
          return channel;
        },
        detail: async () => ({}),
      },
      connection: {
        state: "open",
        onStateChange: (handler) => {
          stateHandler = handler;
          return () => {};
        },
      },
      cardWaitMs: 50,
    },
    checkFilters({}),
    controller.signal,
  );
  void (async () => {
    for await (const item of run) out.push(item);
  })();
  const kinds = () =>
    out.map((item) => (item.kind === "request" ? item.request.requestId : item.kind));
  const thread = (threadId: string) => threads.get(threadId as ThreadId)?.at(-1);
  return {
    shell,
    threads,
    thread,
    kinds,
    out,
    controller,
    drop: () => stateHandler?.("connecting"),
  };
}

describe("request watch orderings", () => {
  it("holds a resumed thread watch through its marker, past a replayed run end", async () => {
    const script = scripted(makeShellSnapshot({ snapshotSequence: 4 }));
    const archived = makeAppThread({ archivedAt: at(1) });
    await until(() => script.shell.size === 0);
    script.shell.push({
      kind: "thread.removed",
      sequence: 5,
      location: "active",
      threadId: "thread-1" as ThreadId,
    });
    await until(() => script.thread("thread-1") !== undefined);
    const watch = script.thread("thread-1")!;
    const first = makeProjection({
      thread: archived,
      runtimeRequests: [request("request-1")],
      turnItems: [items.approvalRequest("request-1")],
    });
    watch.push({ kind: "snapshot", snapshot: { snapshotSequence: 5, projection: first } });
    watch.push({ kind: "synchronized" });
    script.shell.push({ kind: "synchronized" });
    await until(() => script.kinds().length === 2);
    expect(script.kinds()).toEqual(["request-1", "synchronized"]);

    script.shell.push({ kind: "reconnected", afterSequence: 5 });
    watch.push({ kind: "reconnected", afterSequence: 5 });
    // After this event nothing but the wait for the marker keeps the watch open.
    watch.push(event(6, "runtime-request.updated", request("request-1", "resolved")));
    watch.push(event(7, "runtime-request.updated", request("request-2")));
    watch.push(event(8, "turn-item.updated", items.approvalRequest("request-2")));
    script.shell.push({ kind: "synchronized" });
    watch.push({ kind: "synchronized" });
    await until(() => script.kinds().length === 4);
    expect(script.kinds()).toEqual(["request-1", "synchronized", "request-2", "reconnected"]);
    expect(script.threads.get("thread-1" as ThreadId)).toHaveLength(1);
    script.controller.abort();
  });

  it("does not take a marker buffered before a socket drop as the resumed one", async () => {
    const waiting = makeShellThread({
      pendingRuntimeRequest: { id: "request-1", kind: "command", createdAt: at(1) },
    });
    const script = scripted(makeShellSnapshot({ snapshotSequence: 4, threads: [waiting] }));
    await until(() => script.thread("thread-1") !== undefined);
    const watch = script.thread("thread-1")!;
    const view = makeProjection({
      runtimeRequests: [request("request-1")],
      turnItems: [items.approvalRequest("request-1")],
    });
    watch.push({ kind: "snapshot", snapshot: { snapshotSequence: 4, projection: view } });
    watch.push({ kind: "synchronized" });
    script.shell.push({ kind: "synchronized" });
    await until(() => script.kinds().length === 2);

    script.drop();
    watch.push({ kind: "synchronized" });
    script.shell.push({ kind: "reconnected", afterSequence: 4 });
    script.shell.push({ kind: "synchronized" });
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(script.kinds()).toEqual(["request-1", "synchronized"]);
    watch.push({ kind: "reconnected", afterSequence: 4 });
    watch.push(event(5, "runtime-request.updated", request("request-2")));
    watch.push(event(6, "turn-item.updated", items.approvalRequest("request-2")));
    watch.push({ kind: "synchronized" });
    await until(() => script.kinds().length === 4);
    expect(script.kinds()).toEqual(["request-1", "synchronized", "request-2", "reconnected"]);
    script.controller.abort();
  });

  it("does not take a shell marker buffered before a drop as the resync's", async () => {
    const script = scripted(makeShellSnapshot({ snapshotSequence: 4 }));
    await until(() => script.shell.size === 0);
    script.shell.push({ kind: "synchronized" });
    await until(() => script.kinds().length === 1);
    script.drop();
    script.shell.push({ kind: "synchronized" });
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(script.kinds()).toEqual(["synchronized"]);
    script.shell.push({ kind: "reconnected", afterSequence: 4 });
    script.shell.push({ kind: "synchronized" });
    await until(() => script.kinds().length === 2);
    expect(script.kinds()).toEqual(["synchronized", "reconnected"]);
    script.controller.abort();
  });

  it("waits for the resync's shell marker when the socket drops before readiness", async () => {
    const waiting = makeShellThread({
      pendingRuntimeRequest: { id: "request-1", kind: "command", createdAt: at(1) },
    });
    const script = scripted(makeShellSnapshot({ snapshotSequence: 4, threads: [waiting] }));
    await until(() => script.thread("thread-1") !== undefined);
    script.shell.push({ kind: "synchronized" });
    await new Promise((resolve) => setTimeout(resolve, 50));
    script.drop();
    const watch = script.thread("thread-1")!;
    const view = makeProjection({
      runtimeRequests: [request("request-1")],
      turnItems: [items.approvalRequest("request-1")],
    });
    watch.push({ kind: "reconnected", afterSequence: 0 });
    watch.push({ kind: "snapshot", snapshot: { snapshotSequence: 4, projection: view } });
    watch.push({ kind: "synchronized" });
    await until(() => script.kinds().length === 1);
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(script.kinds()).toEqual(["request-1"]);
    script.shell.push({ kind: "reconnected", afterSequence: 4 });
    script.shell.push({ kind: "synchronized" });
    await until(() => script.kinds().length === 2);
    expect(script.kinds()).toEqual(["request-1", "synchronized"]);
    script.controller.abort();
  });

  it("ends a card wait that runs out during a replay at the replay's marker", async () => {
    const waiting = makeShellThread({
      pendingRuntimeRequest: { id: "request-1", kind: "command", createdAt: at(1) },
    });
    const script = scripted(makeShellSnapshot({ snapshotSequence: 4, threads: [waiting] }));
    await until(() => script.thread("thread-1") !== undefined);
    const watch = script.thread("thread-1")!;
    // Seen pending without its card, so its report waits.
    const view = makeProjection({ runtimeRequests: [request("request-1")] });
    watch.push({ kind: "snapshot", snapshot: { snapshotSequence: 4, projection: view } });
    watch.push({ kind: "synchronized" });
    script.shell.push({ kind: "synchronized" });
    await new Promise((resolve) => setTimeout(resolve, 10));
    script.drop();
    watch.push({ kind: "reconnected", afterSequence: 4 });
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(script.kinds()).toEqual([]);
    watch.push(event(5, "runtime-request.updated", request("request-1", "resolved")));
    watch.push({ kind: "synchronized" });
    script.shell.push({ kind: "reconnected", afterSequence: 4 });
    script.shell.push({ kind: "synchronized" });
    await until(() => script.kinds().length === 2);
    expect(script.kinds()).toEqual(["request-1", "synchronized"]);
    expect(script.out[0]).toMatchObject({ request: { request: { status: "resolved" } } });
    script.controller.abort();
  });
});
