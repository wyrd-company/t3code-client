// ---
// relationships:
//   implements: library-transport
// ---
/**
 * The routes of a guest who has a share's link. None sends the session's token. `guest.redeem`
 * answers with a session cookie for one share, and the other routes need that cookie, so the
 * client's `fetch` must keep it, as for `auth.browserSession`. `?share=` names the share.
 */
import { z } from "zod";

import { AssetContent } from "../../schemas/assets.ts";
import { GuestShareId, TrimmedNonEmptyString } from "../../schemas/common.ts";
import { OrchestrationV2CommandOutputFrame } from "../../schemas/orchestration/commandOutput.ts";
import { GuestRedeemRequest, GuestSubmitRequest } from "../../schemas/orchestration/guestShare.ts";
import { GuestStreamEvent } from "../../schemas/orchestration/guestStream.ts";
import { OrchestrationV2ThreadHistoryPage } from "../../schemas/orchestration/projection.ts";
import { OrchestrationV2GetTurnItemResult } from "../../schemas/orchestration/stream.ts";
import { defineEventStreamRoute, defineRoute } from "../spec.ts";

const shareQuery = z.strictObject({ query: z.strictObject({ share: GuestShareId }) });
const itemQuery = z.strictObject({
  query: z.strictObject({ share: GuestShareId, item: TrimmedNonEmptyString }),
});

export const guestRoutes = {
  /** Answers 204 and sets the cookie. A first redeem sets the guest's name on the share. */
  "guest.redeem": defineRoute({
    method: "POST",
    path: "/api/guest/redeem",
    auth: "none",
    input: z.strictObject({ body: GuestRedeemRequest }),
    success: z.undefined(),
  }),
  /** Answers 204 when this client holds a session for the share. */
  "guest.session": defineRoute({
    method: "GET",
    path: "/api/guest/session",
    auth: "none",
    input: shareQuery,
    success: z.undefined(),
  }),
  /** Proposes a message, which the owner sends or dismisses. */
  "guest.submit": defineRoute({
    method: "POST",
    path: "/api/guest/messages",
    auth: "none",
    input: z.strictObject({
      query: z.strictObject({ share: GuestShareId }),
      body: GuestSubmitRequest,
    }),
    success: z.undefined(),
    multipart: true,
    multipartFileField: "file",
  }),
  "guest.stream": defineEventStreamRoute({
    method: "GET",
    path: "/api/guest/stream",
    auth: "none",
    input: shareQuery,
    success: GuestStreamEvent,
  }),
  /** The page of one HTML render in the thread. */
  "guest.render": defineRoute({
    method: "GET",
    path: "/api/guest/render",
    auth: "none",
    input: itemQuery,
    success: AssetContent,
    binaryResponse: true,
  }),
  "guest.item": defineRoute({
    method: "GET",
    path: "/api/guest/item",
    auth: "none",
    input: itemQuery,
    success: OrchestrationV2GetTurnItemResult,
  }),
  /** Older turns. `cursor` comes from the stream's snapshot. */
  "guest.history": defineRoute({
    method: "GET",
    path: "/api/guest/history",
    auth: "none",
    input: z.strictObject({
      query: z.strictObject({ share: GuestShareId, cursor: TrimmedNonEmptyString }),
    }),
    success: OrchestrationV2ThreadHistoryPage,
  }),
  /** The output of one command. It ends when the command settles. */
  "guest.commandOutput": defineEventStreamRoute({
    method: "GET",
    path: "/api/guest/command-output",
    auth: "none",
    input: itemQuery,
    success: OrchestrationV2CommandOutputFrame,
  }),
  /** A file of the thread or of a waiting message. */
  "guest.attachment": defineRoute({
    method: "GET",
    path: "/api/guest/attachment",
    auth: "none",
    input: z.strictObject({
      query: z.strictObject({ share: GuestShareId, id: TrimmedNonEmptyString }),
    }),
    success: AssetContent,
    binaryResponse: true,
  }),
  /** An image on the host that an agent reply in the thread shows. */
  "guest.media": defineRoute({
    method: "GET",
    path: "/api/guest/media",
    auth: "none",
    input: z.strictObject({
      query: z.strictObject({ share: GuestShareId, path: TrimmedNonEmptyString }),
    }),
    success: AssetContent,
    binaryResponse: true,
  }),
};
