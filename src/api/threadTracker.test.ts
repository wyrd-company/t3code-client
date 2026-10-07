import { describe, expect, it } from "vite-plus/test";
import {
  at,
  events,
  items,
  makeProjection,
  makeRun,
  makeRuntimeRequest,
  makeSnapshot,
  parseEvent,
} from "../../test/support/threadFixtures.ts";
import { ThreadProjectionTracker, type ThreadDerivedItem } from "./threadTracker.ts";

/** The domain event inside a wire-shaped stream item. */
const ev = (item: Record<string, unknown>) => parseEvent(item["event"] as Record<string, unknown>);
const apply = (tracker: ThreadProjectionTracker, item: Record<string, unknown>) => [
  ...tracker.apply(item["sequence"] as number, ev(item)),
];

describe("ThreadProjectionTracker", () => {
  it("yields nothing before it is seeded", () => {
    const tracker = new ThreadProjectionTracker();
    expect(tracker.seeded).toBe(false);
    expect(apply(tracker, events.runCreated(1))).toEqual([]);
    expect(tracker.projection).toBeUndefined();
  });

  it("announces requests open in the seed and resolves them later", () => {
    const tracker = new ThreadProjectionTracker();
    const seeded = [
      ...tracker.seed(
        makeSnapshot(
          makeProjection({
            runtimeRequests: [makeRuntimeRequest("r1")],
            turnItems: [items.approvalRequest("r1")],
          }),
          5,
        ),
      ),
    ];
    expect(seeded).toMatchObject([
      { kind: "approval-requested", requestId: "r1", item: { type: "approval_request" } },
    ]);
    expect(tracker.seeded).toBe(true);
    const resolved = apply(
      tracker,
      events.runtimeRequestUpdated(6, "r1", { status: "resolved", resolvedAt: at }),
    );
    expect(resolved).toEqual([{ kind: "request-resolved", requestId: "r1" }]);
    const question = apply(tracker, events.runtimeRequestUpdated(7, "r2", { kind: "user_input" }));
    expect(question).toMatchObject([
      { kind: "user-input-requested", requestId: "r2", questions: [] },
    ]);
    // Announced once: another update to the same open request is quiet.
    expect(apply(tracker, events.runtimeRequestUpdated(8, "r2", { kind: "user_input" }))).toEqual(
      [],
    );
  });

  it("reports assistant text with the appended delta, or the whole text on a rewrite", () => {
    const tracker = new ThreadProjectionTracker();
    expect([...tracker.seed(makeSnapshot(makeProjection(), 1))]).toEqual([]);
    const first = apply(tracker, events.turnItemUpdated(2, items.assistantMessage("po")));
    const second = apply(tracker, events.turnItemUpdated(3, items.assistantMessage("pong")));
    const rewrite = apply(
      tracker,
      events.turnItemUpdated(4, items.assistantMessage("nope", false)),
    );
    const deltas = [...first, ...second, ...rewrite].filter(
      (i): i is Extract<ThreadDerivedItem, { kind: "assistant-delta" }> =>
        i.kind === "assistant-delta",
    );
    expect(deltas.map((d) => [d.text, d.delta, d.streaming])).toEqual([
      ["po", "po", true],
      ["pong", "ng", true],
      ["nope", "nope", false],
    ]);
    expect(deltas[0]).toMatchObject({ runId: "run-1", itemId: "item-1", messageId: "message-2" });
  });

  it("settles a run once when it reaches a terminal status", () => {
    const tracker = new ThreadProjectionTracker();
    expect([...tracker.seed(makeSnapshot(makeProjection(), 1))]).toEqual([]);
    expect(apply(tracker, events.runCreated(2))).toEqual([]);
    const settled = apply(tracker, events.runUpdated(3, { status: "completed", completedAt: at }));
    expect(settled).toMatchObject([{ kind: "turn-settled", outcome: { state: "completed" } }]);
    expect(apply(tracker, events.runUpdated(4, { status: "completed", completedAt: at }))).toEqual(
      [],
    );
  });

  it("does not re-announce a run the seed already shows as settled", () => {
    const tracker = new ThreadProjectionTracker();
    const seeded = [
      ...tracker.seed(
        makeSnapshot(makeProjection({ runs: [makeRun({ status: "failed", completedAt: at })] }), 5),
      ),
    ];
    expect(seeded).toEqual([]);
    expect(apply(tracker, events.runUpdated(6, { status: "failed", completedAt: at }))).toEqual([]);
  });

  it("skips events at or below the projected sequence and unknown events", () => {
    const tracker = new ThreadProjectionTracker();
    expect([...tracker.seed(makeSnapshot(makeProjection(), 5))]).toEqual([]);
    expect(apply(tracker, events.runUpdated(5, { status: "completed", completedAt: at }))).toEqual(
      [],
    );
    expect(tracker.projection?.runs).toEqual([]);
    const unknown = {
      sequence: 6,
      event: { ...(events.runCreated(6)["event"] as object), type: "run.something-new" },
    };
    expect(apply(tracker, unknown)).toEqual([]);
    expect(tracker.projection?.runs).toEqual([]);
    expect(apply(tracker, events.runCreated(7))).toEqual([]);
    expect(tracker.projection?.runs).toHaveLength(1);
  });
});
