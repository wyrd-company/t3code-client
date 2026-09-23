// ---
// relationships:
//   implements: design
// ---
import { z } from "zod";
import { stringRecord } from "../../common.ts";
import { ChatImageAttachment, ChatFileAttachment } from "../model.ts";

export const PROVIDER_SEND_TURN_MAX_ATTACHMENTS = 8;
export const UserInputAttachments = stringRecord(
  z
    .array(z.union([ChatImageAttachment, ChatFileAttachment]))
    .max(PROVIDER_SEND_TURN_MAX_ATTACHMENTS),
);
export type UserInputAttachments = z.infer<typeof UserInputAttachments>;
