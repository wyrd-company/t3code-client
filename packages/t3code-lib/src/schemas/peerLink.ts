// ---
// relationships:
//   implements: library
// ---
/**
 * Links from this environment to another one (the peer), as in
 * `packages/contracts/src/peerLink.ts`.
 */
import { z } from "zod";
import { AuthMcpClientAccess, AuthMcpClientGrantedAccess } from "./auth.ts";
import {
  EnvironmentId,
  IsoDateTime,
  ThreadId,
  TrimmedNonEmptyString,
  TurnItemId,
  forwardCompatibleLiteral,
} from "./common.ts";

export const PeerLink = z.looseObject({
  environmentId: EnvironmentId,
  label: z.string(),
  /** Addresses the peer was linked at, tried in order. */
  urls: z.array(TrimmedNonEmptyString),
  access: AuthMcpClientGrantedAccess,
  linkedAt: IsoDateTime,
  expiresAt: IsoDateTime,
  lastReachedAt: IsoDateTime.nullable(),
  lastError: z.string().nullable(),
});
export type PeerLink = z.infer<typeof PeerLink>;

/** Whether a link can be used now, as worked out when it is listed. */
export const PeerLinkStatus = forwardCompatibleLiteral(["reachable", "unreachable", "expired"]);
export type PeerLinkStatus = z.infer<typeof PeerLinkStatus>;

export const PeerLinkSummary = z.looseObject({
  ...PeerLink.shape,
  status: PeerLinkStatus,
});
export type PeerLinkSummary = z.infer<typeof PeerLinkSummary>;

export const PeerLinkCreateInput = z.looseObject({
  /** Where the peer answers: an https, Tailscale, LAN or loopback base URL. */
  url: TrimmedNonEmptyString,
  /** More addresses for the same peer, tried after `url`. */
  alternateUrls: z.array(TrimmedNonEmptyString).optional(),
  /** A pairing code from the peer. The server uses it once and does not record it. */
  pairingCode: TrimmedNonEmptyString,
  access: AuthMcpClientAccess,
  /** Addresses that answer as another environment are skipped. */
  expectedEnvironmentId: EnvironmentId.optional(),
  /** What the user calls that environment, to name it when it cannot be reached. */
  expectedLabel: TrimmedNonEmptyString.optional(),
});
export type PeerLinkCreateInput = z.infer<typeof PeerLinkCreateInput>;

export const PeerLinkRemoveInput = z.looseObject({ environmentId: EnvironmentId });
export type PeerLinkRemoveInput = z.infer<typeof PeerLinkRemoveInput>;

export const PeerLinkRemoveResult = z.looseObject({ removed: z.boolean() });
export type PeerLinkRemoveResult = z.infer<typeof PeerLinkRemoveResult>;

/** The user's answer to a `link_request` turn item. */
export const PeerLinkRequestAnswerInput = z.looseObject({
  threadId: ThreadId,
  turnItemId: TurnItemId,
  answer: z.discriminatedUnion("type", [
    z.looseObject({
      type: z.literal("link"),
      /** The machine the user picked, when they picked one rather than typing an address. */
      environmentId: EnvironmentId.optional(),
      label: TrimmedNonEmptyString.optional(),
      /** The addresses the client knows for that machine, most preferred first. */
      urls: z.array(TrimmedNonEmptyString).min(1),
      access: AuthMcpClientAccess,
      pairingCode: TrimmedNonEmptyString,
    }),
    /** Answers with a machine this environment is already linked to, as it is. */
    z.looseObject({ type: z.literal("use-existing"), environmentId: EnvironmentId }),
    z.looseObject({ type: z.literal("decline") }),
  ]),
});
export type PeerLinkRequestAnswerInput = z.infer<typeof PeerLinkRequestAnswerInput>;
