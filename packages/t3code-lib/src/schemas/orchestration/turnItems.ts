// ---
// relationships:
//   implements: library
// ---
/**
 * The timeline rows of a thread, typed by `type`. A row of a type this build
 * does not know decodes as `{ unknown: true, raw }`; arrays of rows drop it.
 */
import { z } from "zod";
import {
  NonNegativeInt,
  ThreadId,
  TurnItemId,
  forwardCompatibleLiteral,
  isUnknownVariant,
  knownMembersArray,
  taggedUnionWithUnknown,
  type UnknownVariant,
} from "../common.ts";
import { OrchestrationV2TurnItemMembers } from "./turnItemMembers.ts";

export { OrchestrationV2TurnItemMembers };

/** A turn item of any type, including a type this build does not know. */
export const OrchestrationV2TurnItem = taggedUnionWithUnknown(
  "type",
  OrchestrationV2TurnItemMembers,
);
export type OrchestrationV2TurnItem = z.infer<typeof OrchestrationV2TurnItem>;
export type KnownOrchestrationV2TurnItem = Exclude<OrchestrationV2TurnItem, UnknownVariant<"type">>;
export type OrchestrationV2TurnItemType = KnownOrchestrationV2TurnItem["type"];
export type OrchestrationV2TurnItemOfType<T extends OrchestrationV2TurnItemType> = Extract<
  KnownOrchestrationV2TurnItem,
  { type: T }
>;

/** Narrow a known timeline item to the requested item type. */
export function isTurnItemOfType<const T extends OrchestrationV2TurnItemType>(
  item: OrchestrationV2TurnItem,
  type: T,
): item is OrchestrationV2TurnItemOfType<T> {
  return !isUnknownVariant<"type">(item) && item.type === type;
}

/** Turn items as a projection carries them: rows of unknown types are dropped. */
export const OrchestrationV2TurnItems = knownMembersArray(OrchestrationV2TurnItem);

export const OrchestrationV2ProjectedTurnItem = z.looseObject({
  position: NonNegativeInt,
  visibility: forwardCompatibleLiteral(["local", "inherited", "synthetic"]),
  sourceThreadId: ThreadId,
  sourceItemId: TurnItemId,
  item: OrchestrationV2TurnItem,
});
export type OrchestrationV2ProjectedTurnItem = z.infer<typeof OrchestrationV2ProjectedTurnItem> & {
  readonly item: KnownOrchestrationV2TurnItem;
};
/** Projected rows whose nested item is of a type this build does not know are dropped. */
export const OrchestrationV2ProjectedTurnItems: z.ZodType<
  OrchestrationV2ProjectedTurnItem[],
  unknown
> = z
  .array(OrchestrationV2ProjectedTurnItem)
  .transform((rows) =>
    rows.filter(
      (row): row is OrchestrationV2ProjectedTurnItem => !isUnknownVariant<"type">(row.item),
    ),
  );
