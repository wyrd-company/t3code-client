// ---
// relationships:
//   implements: library
// ---
import { describe, expect, it } from "vite-plus/test";
import { ids, items, makeProjection } from "../../../test/support/threadFixtures.ts";
import { boundedSnapshotProjection } from "./boundedSnapshot.ts";

const local = items.assistantMessage("local", false, { id: "item-local" });
const inherited = items.assistantMessage("inherited", false, { id: "item-inherited" });
const older = items.assistantMessage("older", false, { id: "item-older" });
const row = (position: number, visibility: string, item: Record<string, unknown>) => ({
  position,
  visibility,
  sourceThreadId: visibility === "local" ? ids.threadId : "thread-parent",
  sourceItemId: item["id"],
  item,
});

describe("boundedSnapshotProjection", () => {
  const compact = makeProjection({
    turnItems: [older],
    visibleTurnItems: [row(0, "inherited", inherited), row(1, "local", local)],
  });

  it("puts the local visible rows' items back in front of a compact snapshot's turn items", () => {
    const projection = boundedSnapshotProjection({
      projection: compact,
      turnItemsOmitLocalVisible: true,
    });
    expect(projection.turnItems.map((item) => item.id)).toEqual(["item-local", "item-older"]);
  });
  it("leaves an uncompacted snapshot as it is", () => {
    expect(boundedSnapshotProjection({ projection: compact })).toBe(compact);
  });
});
