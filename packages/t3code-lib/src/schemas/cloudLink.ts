// ---
// relationships:
//   implements: library
// ---
/**
 * Mirrors the `connect` group of `packages/contracts/src/environmentHttp.ts` and what it takes
 * from `relay.ts`: how a server links to a relay, and how the relay asks the server for its
 * health and for a credential. A closed value in an input has its own form, because the same
 * name in a result stays open for a newer server. Unknown keys pass.
 */
import { z } from "zod";
import {
  EnvironmentId,
  TrimmedNonEmptyString,
  forwardCompatibleLiteral,
  taggedUnionWithUnknown,
} from "./common.ts";
import { ExecutionEnvironmentDescriptor } from "./environment.ts";

const RelayManagedEndpointProviderKind = z.enum(["manual", "cloudflare_tunnel", "t3_relay"]);

export const RelayLinkProofRequest = z.looseObject({
  challenge: z.string(),
  relayIssuer: z.string(),
  endpoint: z.looseObject({
    httpBaseUrl: TrimmedNonEmptyString,
    wsBaseUrl: TrimmedNonEmptyString,
    providerKind: RelayManagedEndpointProviderKind,
  }),
  origin: z.looseObject({
    localHttpHost: TrimmedNonEmptyString,
    localHttpPort: z.number().int().min(1).max(65_535),
  }),
});
export type RelayLinkProofRequest = z.input<typeof RelayLinkProofRequest>;

/** A signed token that names this environment and the challenge. */
export const RelayEnvironmentLinkProof = TrimmedNonEmptyString;
export type RelayEnvironmentLinkProof = z.infer<typeof RelayEnvironmentLinkProof>;

export const RelayEnvironmentConfigRequest = z.looseObject({
  /** An `https` origin. */
  relayUrl: z.string(),
  relayIssuer: z.string().optional(),
  cloudUserId: z.string(),
  environmentCredential: z.string(),
  /** An Ed25519 public key in PEM form. */
  cloudMintPublicKey: z.string(),
  endpointRuntime: z
    .looseObject({
      providerKind: RelayManagedEndpointProviderKind,
      connectorToken: TrimmedNonEmptyString,
      tunnelId: TrimmedNonEmptyString.optional(),
      tunnelName: TrimmedNonEmptyString.optional(),
    })
    .nullable(),
});
export type RelayEnvironmentConfigRequest = z.input<typeof RelayEnvironmentConfigRequest>;

export const EnvironmentCloudRelayConfigResult = z.looseObject({
  ok: z.boolean(),
  /** The contract leaves this open. `status` names the state of the tunnel client. */
  endpointRuntimeStatus: z.unknown(),
});
export type EnvironmentCloudRelayConfigResult = z.infer<typeof EnvironmentCloudRelayConfigResult>;

export const EnvironmentConnectReachability = taggedUnionWithUnknown("status", [
  z.looseObject({
    status: z.literal("reachable"),
    checkedAt: z.string(),
    /** Null when the tunnel client did not report a count. */
    readyConnections: z.number().int().nullable(),
    protocol: z.string().nullable(),
  }),
  z.looseObject({
    status: z.literal("unreachable"),
    checkedAt: z.string(),
    cause: forwardCompatibleLiteral([
      "not_linked",
      "connector_not_running",
      "connector_not_ready",
      "edge_unreachable",
      "no_connector",
      "origin_unreachable",
      "dns_failed",
      "timeout",
      "unexpected_response",
    ]),
    reason: z.string(),
    hint: z.string().nullable(),
    fix: z.string(),
  }),
]);
export type EnvironmentConnectReachability = z.infer<typeof EnvironmentConnectReachability>;

export const EnvironmentCloudLinkStateResult = z.looseObject({
  linked: z.boolean(),
  cloudUserId: z.string().nullable(),
  relayUrl: z.string().nullable(),
  relayIssuer: z.string().nullable(),
  managedTunnelActive: z.boolean().nullish(),
  publishAgentActivity: z.boolean(),
  holdWebhooksWhileOffline: z.boolean().nullish(),
  linkRevoked: z.boolean().nullish(),
  /** The latest check that the server ran by itself. Absent until one finishes. */
  reachability: EnvironmentConnectReachability.nullish(),
});
export type EnvironmentCloudLinkStateResult = z.infer<typeof EnvironmentCloudLinkStateResult>;

export const EnvironmentCloudPreferencesRequest = z.looseObject({
  publishAgentActivity: z.boolean(),
  /** The server sends this to its relay, so an unlinked server refuses it. */
  holdWebhooksWhileOffline: z.boolean().optional(),
});
export type EnvironmentCloudPreferencesRequest = z.input<typeof EnvironmentCloudPreferencesRequest>;

export const RelayCloudEnvironmentHealthRequest = z.looseObject({
  /** A token from the relay, signed with the key of `cloudMintPublicKey`. */
  proof: TrimmedNonEmptyString,
});
export type RelayCloudEnvironmentHealthRequest = z.input<typeof RelayCloudEnvironmentHealthRequest>;

export const RelayEnvironmentHealthResponse = z.looseObject({
  environmentId: EnvironmentId,
  status: forwardCompatibleLiteral(["online"]),
  descriptor: ExecutionEnvironmentDescriptor,
  checkedAt: TrimmedNonEmptyString,
  proof: TrimmedNonEmptyString,
});
export type RelayEnvironmentHealthResponse = z.infer<typeof RelayEnvironmentHealthResponse>;

export const RelayCloudMintCredentialRequest = z.looseObject({
  /** A token from the relay, signed with the key of `cloudMintPublicKey`. */
  proof: TrimmedNonEmptyString,
});
export type RelayCloudMintCredentialRequest = z.input<typeof RelayCloudMintCredentialRequest>;

export const RelayEnvironmentMintResponse = z.looseObject({
  /** A pairing credential that only the key of the proof's thumbprint can exchange. */
  credential: TrimmedNonEmptyString,
  expiresAt: TrimmedNonEmptyString,
  proof: TrimmedNonEmptyString,
});
export type RelayEnvironmentMintResponse = z.infer<typeof RelayEnvironmentMintResponse>;
