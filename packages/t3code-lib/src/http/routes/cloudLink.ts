// ---
// relationships:
//   implements: library-transport
// ---
import { z } from "zod";

import {
  EnvironmentCloudLinkStateResult,
  EnvironmentCloudPreferencesRequest,
  EnvironmentCloudRelayConfigResult,
  EnvironmentConnectReachability,
  RelayCloudEnvironmentHealthRequest,
  RelayCloudMintCredentialRequest,
  RelayEnvironmentConfigRequest,
  RelayEnvironmentHealthResponse,
  RelayEnvironmentLinkProof,
  RelayEnvironmentMintResponse,
  RelayLinkProofRequest,
} from "../../schemas/cloudLink.ts";
import { defineRoute } from "../spec.ts";

export const cloudLinkRoutes = {
  // The server enforces relay:configure on 0.1.11 and relay:write on older releases.
  "connect.linkProof": defineRoute({
    method: "POST",
    path: "/api/connect/link-proof",
    auth: "required",
    input: z.strictObject({ body: RelayLinkProofRequest }),
    success: RelayEnvironmentLinkProof,
  }),
  // The server enforces relay:configure on 0.1.11 and relay:write on older releases.
  "connect.relayConfig": defineRoute({
    method: "POST",
    path: "/api/connect/relay-config",
    auth: "required",
    input: z.strictObject({ body: RelayEnvironmentConfigRequest }),
    success: EnvironmentCloudRelayConfigResult,
  }),
  "connect.linkState": defineRoute({
    method: "GET",
    path: "/api/connect/link-state",
    auth: "required",
    scope: "relay:read",
    input: z.undefined(),
    success: EnvironmentCloudLinkStateResult,
  }),
  "connect.checkReachability": defineRoute({
    method: "POST",
    path: "/api/connect/reachability",
    auth: "required",
    scope: "relay:read",
    input: z.undefined(),
    success: EnvironmentConnectReachability,
  }),
  "connect.unlink": defineRoute({
    method: "POST",
    path: "/api/connect/unlink",
    auth: "required",
    scope: "relay:write",
    input: z.undefined(),
    success: EnvironmentCloudRelayConfigResult,
  }),
  "connect.preferences": defineRoute({
    method: "POST",
    path: "/api/connect/preferences",
    auth: "required",
    scope: "relay:write",
    input: z.strictObject({ body: EnvironmentCloudPreferencesRequest }),
    success: EnvironmentCloudLinkStateResult,
  }),
  "connect.liveActivityPreference": defineRoute({
    method: "POST",
    path: "/api/connect/live-activity-preference",
    auth: "required",
    scope: "relay:write",
    input: z.strictObject({ body: z.looseObject({ liveActivitiesEnabled: z.boolean() }) }),
    success: z.looseObject({ ok: z.boolean() }),
  }),
  /** The relay calls this, and its proof is the credential. */
  "connect.health": defineRoute({
    method: "POST",
    path: "/api/t3-connect/health",
    auth: "none",
    input: z.strictObject({ body: RelayCloudEnvironmentHealthRequest }),
    success: RelayEnvironmentHealthResponse,
  }),
  /** The relay calls this, and its proof is the credential. */
  "connect.mintCredential": defineRoute({
    method: "POST",
    path: "/api/t3-connect/mint-credential",
    auth: "none",
    input: z.strictObject({ body: RelayCloudMintCredentialRequest }),
    success: RelayEnvironmentMintResponse,
  }),
};
