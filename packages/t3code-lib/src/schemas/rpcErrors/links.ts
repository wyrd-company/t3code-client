/** Tagged failures of peer links and guest links, mirroring `peerLink.ts` and `guestShare.ts`. */
import { forwardCompatibleLiteral } from "../common.ts";
import { Defect, messageAndCause, taggedError } from "./shared.ts";

export const PeerLinkError = taggedError("PeerLinkError", {
  reason: forwardCompatibleLiteral([
    "unreachable",
    "not_a_t3_environment",
    "incompatible",
    "self",
    "pairing_rejected",
    "expired",
    "unknown_link",
    "storage",
    "disabled",
  ]),
  ...messageAndCause,
});
export const PeerLinkRequestError = taggedError("PeerLinkRequestError", {
  reason: forwardCompatibleLiteral([
    "load_failed",
    "not_found",
    "already_answered",
    "record_failed",
  ]),
  cause: Defect.optional(),
});

export const GuestShareCreateError = taggedError("GuestShareCreateError", {
  reason: forwardCompatibleLiteral([
    "disabled",
    "connect_unavailable",
    "thread_unavailable",
    "read_failed",
    "changed",
  ]),
});
