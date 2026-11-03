// ---
// relationships:
//   implements: library
// ---
/** What a guest's stream sends. This is apart from `guestShare.ts`, which the thread imports. */
import { z } from "zod";
import {
  GuestShareId,
  IsoDateTime,
  ProviderDriverKind,
  TrimmedNonEmptyString,
  taggedUnionWithUnknown,
} from "../common.ts";
import { ThreadGuestMessage } from "./guestShare.ts";
import { OrchestrationV2ThreadStreamItem } from "./stream.ts";

/** The model label of a shared thread. `driver` is null when no provider is configured for it. */
export const GuestThreadModel = z.looseObject({
  driver: ProviderDriverKind.nullable(),
  name: TrimmedNonEmptyString,
  shortName: TrimmedNonEmptyString.optional(),
  subProvider: TrimmedNonEmptyString.optional(),
});
export type GuestThreadModel = z.infer<typeof GuestThreadModel>;

export const GuestShareView = z.looseObject({
  shareId: GuestShareId,
  title: z.string(),
  guestName: TrimmedNonEmptyString,
  expiresAt: IsoDateTime,
  messages: z.array(ThreadGuestMessage),
  model: GuestThreadModel,
});
export type GuestShareView = z.infer<typeof GuestShareView>;

/**
 * `view` is the share, first and again when it changes. `thread` carries the items of the owner's
 * thread subscription, with a snapshot first on each connection. `ended` is the last event.
 */
export const GuestStreamEvent = taggedUnionWithUnknown("type", [
  z.looseObject({ type: z.literal("view"), view: GuestShareView }),
  z.looseObject({ type: z.literal("thread"), item: OrchestrationV2ThreadStreamItem }),
  z.looseObject({ type: z.literal("ended") }),
]);
export type GuestStreamEvent = z.infer<typeof GuestStreamEvent>;
