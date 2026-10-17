// ---
// relationships:
//   implements: design
// ---
/** Mirrors `packages/shared/src/orchestrationV2BoundedSnapshot.ts`: the client half of compact snapshots. */
import type { OrchestrationV2ProjectedTurnItem } from "./turnItems.ts";
import type { OrchestrationV2ThreadProjection } from "./projection.ts";

/** Local timeline rows also carry their item in `projection.turnItems`. */
function isLocalTimelineRow(
  projection: Pick<OrchestrationV2ThreadProjection, "thread">,
  row: OrchestrationV2ProjectedTurnItem,
): boolean {
  return row.visibility === "local" || row.sourceThreadId === projection.thread.id;
}

/** Puts back the turn items a compact snapshot omitted: the local visible rows' items lead the list. */
export function restoreLocalVisibleTurnItems(
  projection: OrchestrationV2ThreadProjection,
): OrchestrationV2ThreadProjection {
  const local = projection.visibleTurnItems
    .filter((row) => isLocalTimelineRow(projection, row))
    .map((row) => row.item);
  if (local.length === 0) return projection;
  return { ...projection, turnItems: [...local, ...projection.turnItems] };
}

/** The usable projection of a decoded bounded snapshot, compact or not. */
export function boundedSnapshotProjection(snapshot: {
  readonly projection: OrchestrationV2ThreadProjection;
  readonly turnItemsOmitLocalVisible?: true | undefined;
}): OrchestrationV2ThreadProjection {
  return snapshot.turnItemsOmitLocalVisible === true
    ? restoreLocalVisibleTurnItems(snapshot.projection)
    : snapshot.projection;
}
