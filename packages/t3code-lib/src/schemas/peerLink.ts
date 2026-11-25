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
  taggedUnionWithUnknown,
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

/**
 * A link's name only, for a client that may read threads here but not manage access: enough to
 * name and open a linked environment's threads, without its addresses, access or health.
 */
export const PeerLinkName = z.looseObject({ environmentId: EnvironmentId, label: z.string() });
export type PeerLinkName = z.infer<typeof PeerLinkName>;

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

export const PeerLinkRemoveResult = z.looseObject({
  removed: z.boolean(),
  /** Whether the peer ended the link's session. Older servers never ask it to. */
  endedThere: z.boolean().optional(),
});
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

/**
 * A thread on a linked environment, as a client of this environment names it. This environment
 * reads it over the link, so the stream, history pages and item detail are the owner's.
 */
export const PeerLinkThreadInput = z.looseObject({
  /** The linked environment the thread lives in. */
  environmentId: EnvironmentId,
  threadId: ThreadId,
});
export type PeerLinkThreadInput = z.infer<typeof PeerLinkThreadInput>;

export const PeerLinkThreadHistoryInput = z.looseObject({
  ...PeerLinkThreadInput.shape,
  /** The `historyCursor` of the snapshot or of the page before. */
  cursor: TrimmedNonEmptyString,
});
export type PeerLinkThreadHistoryInput = z.infer<typeof PeerLinkThreadHistoryInput>;

export const PeerLinkThreadItemInput = z.looseObject({
  ...PeerLinkThreadInput.shape,
  itemId: TurnItemId,
  /** Unused by the server; a client keys its cache on it, as for its own threads' items. */
  revision: z.string().optional(),
});
export type PeerLinkThreadItemInput = z.infer<typeof PeerLinkThreadItemInput>;

/** A client of this environment asks to pair with one it links to, without typing a code. */
export const PeerLinkClientPairingInput = z.looseObject({ environmentId: EnvironmentId });
export type PeerLinkClientPairingInput = z.infer<typeof PeerLinkClientPairingInput>;

/**
 * A pairing code from a linked environment, to link another environment there at `access`. The
 * caller must hold the scopes that access grants (`mcpClientScopes`).
 */
export const PeerLinkLinkPairingInput = z.looseObject({
  environmentId: EnvironmentId,
  /** The access the new link will have. */
  access: AuthMcpClientAccess,
});
export type PeerLinkLinkPairingInput = z.infer<typeof PeerLinkLinkPairingInput>;

const pairingTarget = {
  environmentId: EnvironmentId,
  label: z.string(),
  /** The addresses this environment reaches the linked one at; the client tries them itself. */
  urls: z.array(TrimmedNonEmptyString),
};

/**
 * A one-time pairing credential from the linked environment, or why this link cannot get one, in
 * which case the user pairs there with a code of their own.
 */
export const PeerLinkClientPairingResult = taggedUnionWithUnknown("type", [
  z.looseObject({
    type: z.literal("credential"),
    ...pairingTarget,
    credential: TrimmedNonEmptyString,
    expiresAt: IsoDateTime,
  }),
  z.looseObject({
    type: z.literal("unsupported"),
    ...pairingTarget,
    /** `link_access`: the link is below full access; `version`: the peer is older; `refused`, `unreachable`. */
    reason: forwardCompatibleLiteral(["link_access", "version", "refused", "unreachable"]),
  }),
]);
export type PeerLinkClientPairingResult = z.infer<typeof PeerLinkClientPairingResult>;
