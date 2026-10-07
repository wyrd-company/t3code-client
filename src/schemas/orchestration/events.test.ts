// ---
// relationships:
//   implements: design
// ---
import { describe, expect, it } from "vite-plus/test";
import { isUnknownVariant } from "../common.ts";
import { OrchestrationV2DomainEvent, THREAD_STATE_EVENT_TYPES } from "./events.ts";
import { OrchestrationV2ThreadStreamItem } from "./stream.ts";
import {
  at,
  completedRunItems,
  eventItem,
  events,
  ids,
  items,
  makeAppThread,
  makeProjection,
  makeRun,
  makeTurnItem,
  parseEvent,
  rawEvent,
  snapshotItem,
} from "../../../test/support/threadFixtures.ts";

const eventOf = (item: Record<string, unknown>) => item["event"] as Record<string, unknown>;

describe("OrchestrationV2DomainEvent", () => {
  it("decodes every event the fixture builders produce", () => {
    for (const item of completedRunItems(1)) {
      const event = parseEvent(eventOf(item));
      expect(isUnknownVariant(event), String(eventOf(item)["type"])).toBe(false);
    }
    expect(parseEvent(eventOf(events.runCreated(1)))).toMatchObject({
      type: "run.created",
      payload: { id: ids.runId, status: "running" },
    });
    expect(parseEvent(eventOf(events.runtimeRequestUpdated(2, "request-1")))).toMatchObject({
      type: "runtime-request.updated",
      payload: { id: "request-1", kind: "command", responseCapability: { type: "message" } },
    });
    expect(
      parseEvent(eventOf(events.turnItemUpdated(3, items.approvalRequest("request-1")))),
    ).toMatchObject({
      type: "turn-item.updated",
      payload: { type: "approval_request", requestId: "request-1" },
    });
  });
  it("decodes every thread state event with the whole thread as payload", () => {
    for (const type of THREAD_STATE_EVENT_TYPES) {
      const event = parseEvent(eventOf(events.threadState(1, type, { archivedAt: at })));
      expect(event, type).toMatchObject({ type, payload: { id: ids.threadId, archivedAt: at } });
    }
    expect(parseEvent(rawEvent(2, "thread.created", makeAppThread()))).toMatchObject({
      type: "thread.created",
    });
  });
  it("keeps optional provenance fields and unknown keys", () => {
    const raw = {
      ...rawEvent(1, "run.updated", { ...(eventOf(events.runUpdated(1))["payload"] as object) }),
      runId: ids.runId,
      driver: "sample-driver",
      providerInstanceId: "sample-provider",
      rawEventId: "raw-1",
      futureField: true,
    };
    expect(parseEvent(raw)).toMatchObject({ driver: "sample-driver", futureField: true });
  });
  it("decodes an unknown event type as the unknown variant", () => {
    const raw = rawEvent(1, "thread.future-event", { data: 1 });
    expect(parseEvent(raw)).toEqual({ unknown: true, raw });
  });
  it("decodes turn-item.updated whose item type is unknown, with an unknown payload", () => {
    const item = makeTurnItem("future_item", { id: "item-9" });
    const event = parseEvent(eventOf(events.turnItemUpdated(1, item)));
    expect(isUnknownVariant(event)).toBe(false);
    expect(event).toMatchObject({
      type: "turn-item.updated",
      payload: { unknown: true, raw: item },
    });
  });
  it("fails a known event type whose payload is malformed", () => {
    expect(OrchestrationV2DomainEvent.safeParse(rawEvent(1, "run.created", {})).success).toBe(
      false,
    );
    expect(
      OrchestrationV2DomainEvent.safeParse(rawEvent(1, "thread.archived", { id: "x" })).success,
    ).toBe(false);
    expect(
      OrchestrationV2DomainEvent.safeParse(
        eventOf(events.turnItemUpdated(1, makeTurnItem("reasoning", { text: 1 }))),
      ).success,
    ).toBe(false);
  });
  it("fails an event missing its envelope fields", () => {
    const raw = rawEvent(1, "run.created", makeRun());
    delete raw["occurredAt"];
    expect(OrchestrationV2DomainEvent.safeParse(raw).success).toBe(false);
  });
});

describe("OrchestrationV2ThreadStreamItem", () => {
  it("decodes a full snapshot and a bounded one", () => {
    const projection = makeProjection();
    expect(OrchestrationV2ThreadStreamItem.parse(snapshotItem(1, projection))).toEqual({
      kind: "snapshot",
      snapshotSequence: 1,
      projection,
    });
    expect(
      OrchestrationV2ThreadStreamItem.parse({
        ...snapshotItem(2, projection),
        historyCursor: "cursor-1",
        hasMoreHistory: true,
        latestLocalTurnOrdinal: 4,
        payloadBudgetExceeded: false,
      }),
    ).toMatchObject({ kind: "snapshot", historyCursor: "cursor-1", hasMoreHistory: true });
  });
  it("decodes an event item and the synchronized marker", () => {
    expect(OrchestrationV2ThreadStreamItem.parse(events.runCreated(3))).toMatchObject({
      kind: "event",
      sequence: 3,
      event: { type: "run.created" },
    });
    expect(OrchestrationV2ThreadStreamItem.parse({ kind: "synchronized" })).toEqual({
      kind: "synchronized",
    });
  });
  it("decodes an unknown kind as the unknown variant", () => {
    const raw = { kind: "future-kind", sequence: 9 };
    expect(OrchestrationV2ThreadStreamItem.parse(raw)).toEqual({ unknown: true, raw });
  });
  it("carries an unknown event type inside an event item", () => {
    const item = eventItem(4, "thread.future-event", {});
    expect(OrchestrationV2ThreadStreamItem.parse(item)).toEqual({
      kind: "event",
      sequence: 4,
      event: { unknown: true, raw: item["event"] },
    });
  });
  it("fails a known kind that is malformed", () => {
    expect(OrchestrationV2ThreadStreamItem.safeParse({ kind: "snapshot" }).success).toBe(false);
    expect(OrchestrationV2ThreadStreamItem.safeParse({ kind: "event", sequence: -1 }).success).toBe(
      false,
    );
    expect(
      OrchestrationV2ThreadStreamItem.safeParse({
        kind: "event",
        sequence: 1,
        event: { type: "run.created" },
      }).success,
    ).toBe(false);
  });
});
