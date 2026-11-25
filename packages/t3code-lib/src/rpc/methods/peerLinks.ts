// ---
// relationships:
//   implements: library
// ---
import { z } from "zod";
import { mcpClientScopes } from "../../auth/scopes.ts";
import {
  PeerLink,
  PeerLinkClientPairingInput,
  PeerLinkClientPairingResult,
  PeerLinkCreateInput,
  PeerLinkLinkPairingInput,
  PeerLinkName,
  PeerLinkRemoveInput,
  PeerLinkRemoveResult,
  PeerLinkRequestAnswerInput,
  PeerLinkSummary,
  PeerLinkThreadHistoryInput,
  PeerLinkThreadInput,
  PeerLinkThreadItemInput,
} from "../../schemas/peerLink.ts";
import { OrchestrationV2ThreadHistoryPage } from "../../schemas/orchestration/projection.ts";
import {
  OrchestrationV2GetTurnItemResult,
  OrchestrationV2ThreadStreamItem,
} from "../../schemas/orchestration/stream.ts";
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
  /** Names only, so a client that reads threads can open a linked environment's. */
  "peerLinks.names": defineMethod({
    payload: z.looseObject({}),
    success: z.looseObject({ links: z.array(PeerLinkName) }),
    stream: false,
    scope: "orchestration:read",
  }),
  /** A linked environment's thread, read as this one's own are: the same stream items. */
  "peerLinks.subscribeThread": defineMethod({
    payload: PeerLinkThreadInput,
    success: OrchestrationV2ThreadStreamItem,
    stream: true,
    scope: "orchestration:read",
  }),
  "peerLinks.threadHistoryPage": defineMethod({
    payload: PeerLinkThreadHistoryInput,
    success: OrchestrationV2ThreadHistoryPage,
    stream: false,
    scope: "orchestration:read",
  }),
  "peerLinks.threadItem": defineMethod({
    payload: PeerLinkThreadItemInput,
    success: OrchestrationV2GetTurnItemResult,
    stream: false,
    scope: "orchestration:read",
  }),
  "peerLinks.pairClient": defineMethod({
    payload: PeerLinkClientPairingInput,
    success: PeerLinkClientPairingResult,
    stream: false,
    scope: "access:write",
  }),
  /** Handing out access takes holding it: the caller also needs what the new link grants. */
  "peerLinks.pairLink": defineMethod({
    payload: PeerLinkLinkPairingInput,
    success: PeerLinkClientPairingResult,
    stream: false,
    scope: "access:write",
    payloadScopes: (payload) => mcpClientScopes(payload.access),
  }),
} as const;
