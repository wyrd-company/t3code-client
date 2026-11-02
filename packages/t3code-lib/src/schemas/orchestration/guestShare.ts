// ---
// relationships:
//   implements: library
// ---
/**
 * A guest share lets one unauthenticated browser watch a thread over T3 Connect
 * and propose messages. The owner sends or dismisses each one. The server sets
 * this state; the link's credential is only in `GuestShareCreateResult.url`.
 */
import { z } from "zod";
import {
  GuestMessageId,
  GuestShareId,
  IsoDateTime,
  ThreadId,
  TrimmedNonEmptyString,
  forwardCompatibleLiteral,
} from "../common.ts";
import { ChatAttachment } from "./attachments.ts";

export const ThreadGuestMessageStatus = forwardCompatibleLiteral(["pending", "sent", "dismissed"]);
export type ThreadGuestMessageStatus = z.infer<typeof ThreadGuestMessageStatus>;

export const ThreadGuestMessage = z.looseObject({
  id: GuestMessageId,
  text: z.string(),
  status: ThreadGuestMessageStatus,
  submittedAt: IsoDateTime,
  /** The thread's attachments. The server deletes them if the message is dismissed. */
  attachments: z.array(ChatAttachment).optional(),
});
export type ThreadGuestMessage = z.infer<typeof ThreadGuestMessage>;

export const ThreadGuestShare = z.looseObject({
  id: GuestShareId,
  /** The T3 Connect tunnel hostname that the link points at. */
  host: TrimmedNonEmptyString,
  createdAt: IsoDateTime,
  expiresAt: IsoDateTime,
  /** Set once, when the guest redeems the link. */
  guestName: TrimmedNonEmptyString.nullable(),
  messages: z.array(ThreadGuestMessage),
});
export type ThreadGuestShare = z.infer<typeof ThreadGuestShare>;

export const GuestShareCreateInput = z.looseObject({ threadId: ThreadId });
export type GuestShareCreateInput = z.infer<typeof GuestShareCreateInput>;

export const GuestShareCreateResult = z.looseObject({
  /** The link. Its fragment is the guest's credential: treat it as a secret. */
  url: TrimmedNonEmptyString,
  share: ThreadGuestShare,
});
export type GuestShareCreateResult = z.infer<typeof GuestShareCreateResult>;
