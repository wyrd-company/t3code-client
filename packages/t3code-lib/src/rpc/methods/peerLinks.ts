// ---
// relationships:
//   implements: library
// ---
import { z } from "zod";
import {
  PeerLink,
  PeerLinkCreateInput,
  PeerLinkRemoveInput,
  PeerLinkRemoveResult,
  PeerLinkRequestAnswerInput,
  PeerLinkSummary,
} from "../../schemas/peerLink.ts";
import { VoidSuccess, defineMethod } from "../spec.ts";

export const peerLinksMethods = {
  "peerLinks.list": defineMethod({
    payload: z.looseObject({}),
    success: z.looseObject({ links: z.array(PeerLinkSummary) }),
    stream: false,
    scope: "access:read",
  }),
  "peerLinks.link": defineMethod({
    payload: PeerLinkCreateInput,
    success: PeerLink,
    stream: false,
    scope: "access:write",
  }),
  "peerLinks.unlink": defineMethod({
    payload: PeerLinkRemoveInput,
    success: PeerLinkRemoveResult,
    stream: false,
    scope: "access:write",
  }),
  "peerLinks.answerRequest": defineMethod({
    payload: PeerLinkRequestAnswerInput,
    success: VoidSuccess,
    stream: false,
    scope: "access:write",
  }),
} as const;
