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
  TrimmedString,
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

export const GUEST_MESSAGE_MAX_LENGTH = 4_000;
export const GUEST_NAME_MAX_LENGTH = 40;
export const GUEST_MESSAGE_MAX_ATTACHMENTS = 4;

// The server refuses a name that does not read as one plain line of text.
const NAME_BREAKING_CHARACTER = /[\p{Cc}\p{Zl}\p{Zp}\u061C\u200E\u200F\u202A-\u202E\u2066-\u2069]/u;

/** A guest's first request: the credential from the link's fragment, and the guest's name. */
export const GuestRedeemRequest = z.strictObject({
  credential: TrimmedNonEmptyString,
  name: TrimmedNonEmptyString.max(GUEST_NAME_MAX_LENGTH).refine(
    (name) => !NAME_BREAKING_CHARACTER.test(name),
    "The name must be a single line of text.",
  ),
});
export type GuestRedeemRequest = z.infer<typeof GuestRedeemRequest>;

/** One file of a guest's message. */
export const GuestUploadFile = z.strictObject({
  name: z.string().min(1),
  mimeType: z.string().min(1),
  bytes: z.instanceof(Uint8Array),
});
export type GuestUploadFile = z.infer<typeof GuestUploadFile>;

/**
 * A guest's message. `shareId` names the share the guest sees, so the server refuses a message
 * for a replaced link. `text` can be empty when there are files.
 */
export const GuestSubmitRequest = z.strictObject({
  shareId: GuestShareId,
  text: TrimmedString.max(GUEST_MESSAGE_MAX_LENGTH),
  files: z.array(GuestUploadFile).max(GUEST_MESSAGE_MAX_ATTACHMENTS).optional(),
});
export type GuestSubmitRequest = z.infer<typeof GuestSubmitRequest>;
