// ---
// relationships:
//   implements: design
// ---
import { describe, expect, it } from "vite-plus/test";
import { isUnknownVariant } from "../common.ts";
import { OrchestrationV2PlanArtifact } from "./messages.ts";
import { OrchestrationV2ThreadProjection } from "./projection.ts";
import {
  OrchestrationV2ProjectedTurnItems,
  OrchestrationV2TurnItem,
  OrchestrationV2TurnItems,
  isTurnItemOfType,
} from "./turnItems.ts";
import { ids, items, makeProjection, makeTurnItem } from "../../../test/support/threadFixtures.ts";

const projectedRow = (item: Record<string, unknown>, position = 0) => ({
  position,
  visibility: "local",
  sourceThreadId: ids.threadId,
  sourceItemId: item["id"],
  item,
});

const plan = (kind: string, extra: Record<string, unknown> = {}) => ({
  id: "plan-1",
  threadId: ids.threadId,
  runId: null,
  nodeId: ids.nodeId,
  status: "draft",
  kind,
  ...extra,
});

describe("OrchestrationV2TurnItem", () => {
  it("decodes the fixture builders' items with their literal types", () => {
    const message = OrchestrationV2TurnItem.parse(items.assistantMessage("pong", false));
    expect(isTurnItemOfType(message, "assistant_message")).toBe(true);
    if (isTurnItemOfType(message, "assistant_message")) {
      expect(message.text).toBe("pong");
      expect(message.streaming).toBe(false);
    }
    expect(
      isTurnItemOfType(
        OrchestrationV2TurnItem.parse(items.approvalRequest("request-1")),
        "approval_request",
      ),
    ).toBe(true);
    expect(
      isTurnItemOfType(
        OrchestrationV2TurnItem.parse(items.userInputRequest("request-2")),
        "user_input_request",
      ),
    ).toBe(true);
    const error = OrchestrationV2TurnItem.parse(items.error("boom"));
    expect(error).toMatchObject({
      type: "error",
      failure: { class: "provider_error", message: "boom" },
    });
  });
  it("passes unknown keys and unknown statuses through on a known item", () => {
    const item = OrchestrationV2TurnItem.parse(
      makeTurnItem("reasoning", { text: "hm", streaming: true, status: "future", futureField: 1 }),
    );
    expect(item).toMatchObject({ type: "reasoning", status: "future", futureField: 1 });
  });
  it("decodes an item of an unknown type as the unknown variant", () => {
    const raw = makeTurnItem("future_item", { payload: { data: 1 } });
    const item = OrchestrationV2TurnItem.parse(raw);
    expect(item).toEqual({ unknown: true, raw });
    expect(isUnknownVariant(item)).toBe(true);
    expect(isTurnItemOfType(item, "assistant_message")).toBe(false);
  });
  it("fails a known type whose fields are malformed", () => {
    expect(
      OrchestrationV2TurnItem.safeParse(makeTurnItem("assistant_message", { messageId: "m" }))
        .success,
    ).toBe(false);
    expect(
      OrchestrationV2TurnItem.safeParse(items.assistantMessage("x", "yes" as never)).success,
    ).toBe(false);
    expect(OrchestrationV2TurnItem.safeParse(makeTurnItem("error", { failure: {} })).success).toBe(
      false,
    );
  });
  it("decodes the nested fork source as a growing union", () => {
    const fork = (source: Record<string, unknown>) =>
      makeTurnItem("fork", {
        source,
        targetThreadId: "thread-2",
        providerThreadId: "provider-thread-1",
      });
    expect(OrchestrationV2TurnItem.parse(fork({ type: "node", nodeId: "node-1" }))).toMatchObject({
      source: { type: "node", nodeId: "node-1" },
    });
    expect(OrchestrationV2TurnItem.parse(fork({ type: "future" }))).toMatchObject({
      source: { unknown: true },
    });
    expect(OrchestrationV2TurnItem.safeParse(fork({ type: "run", runId: "run-1" })).success).toBe(
      false,
    );
  });
});

describe("OrchestrationV2TurnItems", () => {
  it("drops items of unknown types and keeps the rest in order", () => {
    const decoded = OrchestrationV2TurnItems.parse([
      items.assistantMessage("one"),
      makeTurnItem("future_item", { id: "item-9" }),
      items.error("two"),
    ]);
    expect(decoded.map((item) => item.type)).toEqual(["assistant_message", "error"]);
  });
  it("still fails on a malformed known item", () => {
    expect(
      OrchestrationV2TurnItems.safeParse([makeTurnItem("reasoning", { text: 1 })]).success,
    ).toBe(false);
  });
});

describe("OrchestrationV2ProjectedTurnItems", () => {
  it("drops rows whose nested item is unknown", () => {
    const rows = OrchestrationV2ProjectedTurnItems.parse([
      projectedRow(items.assistantMessage("one"), 0),
      projectedRow(makeTurnItem("future_item", { id: "item-9" }), 1),
    ]);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      position: 0,
      visibility: "local",
      item: { type: "assistant_message" },
    });
  });
  it("keeps an unknown visibility as a string", () => {
    const rows = OrchestrationV2ProjectedTurnItems.parse([
      { ...projectedRow(items.assistantMessage("one")), visibility: "future" },
    ]);
    expect(rows[0]?.visibility).toBe("future");
  });
  it("fails a row missing its source", () => {
    const row = projectedRow(items.assistantMessage("one")) as Record<string, unknown>;
    delete row["sourceThreadId"];
    expect(OrchestrationV2ProjectedTurnItems.safeParse([row]).success).toBe(false);
  });
});

describe("OrchestrationV2PlanArtifact", () => {
  it("decodes both plan kinds and an unknown kind", () => {
    expect(
      OrchestrationV2PlanArtifact.parse(plan("proposed_plan", { markdown: "# Plan" })),
    ).toMatchObject({
      kind: "proposed_plan",
      markdown: "# Plan",
    });
    expect(
      OrchestrationV2PlanArtifact.parse(
        plan("todo_list", { steps: [{ id: "s1", text: "Do", status: "pending" }] }),
      ),
    ).toMatchObject({ kind: "todo_list" });
    expect(OrchestrationV2PlanArtifact.parse(plan("future_plan"))).toMatchObject({ unknown: true });
  });
  it("fails a malformed known kind", () => {
    expect(OrchestrationV2PlanArtifact.safeParse(plan("proposed_plan")).success).toBe(false);
  });
});

describe("OrchestrationV2ThreadProjection", () => {
  it("decodes the fixture projection", () => {
    const projection = makeProjection();
    expect(OrchestrationV2ThreadProjection.parse(projection)).toEqual(projection);
  });
  it("drops unknown turn items, projected rows, and plans while keeping known ones", () => {
    const projection = makeProjection({
      turnItems: [items.assistantMessage("one"), makeTurnItem("future_item", { id: "item-9" })],
      visibleTurnItems: [
        projectedRow(items.assistantMessage("one"), 0),
        projectedRow(makeTurnItem("future_item", { id: "item-9" }), 1),
      ],
      plans: [plan("proposed_plan", { markdown: "# Plan" }), plan("future_plan", { id: "plan-2" })],
    });
    expect(projection.turnItems.map((item) => item.type)).toEqual(["assistant_message"]);
    expect(projection.visibleTurnItems.map((row) => row.item.type)).toEqual(["assistant_message"]);
    expect(projection.plans.map((artifact) => artifact.kind)).toEqual(["proposed_plan"]);
  });
  it("passes unknown top-level keys through", () => {
    expect(makeProjection({ futureCollection: [] })).toMatchObject({ futureCollection: [] });
  });
});
