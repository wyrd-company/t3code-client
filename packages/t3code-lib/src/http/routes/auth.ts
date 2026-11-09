// ---
// relationships:
//   implements: library-wire
// ---
import { z } from "zod";

import {
  AuthAccessTokenResult,
  AuthBrowserSessionRequest,
  AuthBrowserSessionResult,
  AuthCreatePairingCredentialInput,
  AuthOtherClientSessionsRevokeResult,
  AuthPairingCredentialResult,
  AuthRevokeClientSessionInput,
  AuthRevokePairingLinkInput,
  AuthRevokeResult,
  AuthSessionState,
  AuthTokenExchangeRequest,
  AuthWebSocketTicketResult,
  AuthWebSocketTicketUse,
} from "../../schemas/auth.ts";
import { ExecutionEnvironmentDescriptor } from "../../schemas/environment.ts";
import { defineRoute } from "../spec.ts";

const NoInput = z.undefined();

export const authRoutes = {
  "metadata.descriptor": defineRoute({
    method: "GET",
    path: "/.well-known/t3/environment",
    auth: "none",
    input: NoInput,
    success: ExecutionEnvironmentDescriptor,
  }),
  "auth.session": defineRoute({
    method: "GET",
    path: "/api/auth/session",
    auth: "optional",
    input: NoInput,
    success: AuthSessionState,
  }),
  "auth.browserSession": defineRoute({
    method: "POST",
    path: "/api/auth/browser-session",
    auth: "none",
    input: z.strictObject({ body: AuthBrowserSessionRequest }),
    success: AuthBrowserSessionResult,
  }),
  "auth.token": defineRoute({
    method: "POST",
    path: "/oauth/token",
    auth: "none",
    form: true,
    input: z.strictObject({ body: AuthTokenExchangeRequest }),
    success: AuthAccessTokenResult,
  }),
  "auth.webSocketTicket": defineRoute({
    method: "POST",
    path: "/api/auth/websocket-ticket",
    auth: "required",
    input: NoInput,
    success: AuthWebSocketTicketResult,
  }),
  "auth.webSocketTicketFor": defineRoute({
    method: "POST",
    path: "/api/auth/websocket-ticket/:use",
    auth: "required",
    input: z.strictObject({ params: z.strictObject({ use: AuthWebSocketTicketUse }) }),
    success: AuthWebSocketTicketResult,
  }),
  /** Failure bodies are `schemas.httpErrors.EnvironmentPairingCredentialError`. */
  "auth.pairingCredential": defineRoute({
    method: "POST",
    path: "/api/auth/pairing-token",
    auth: "required",
    scope: "access:write",
    input: z.strictObject({ body: AuthCreatePairingCredentialInput }),
    success: AuthPairingCredentialResult,
  }),
  "auth.revokePairingLink": defineRoute({
    method: "POST",
    path: "/api/auth/pairing-links/revoke",
    auth: "required",
    scope: "access:write",
    input: z.strictObject({ body: AuthRevokePairingLinkInput }),
    success: AuthRevokeResult,
  }),
  "auth.revokeClient": defineRoute({
    method: "POST",
    path: "/api/auth/clients/revoke",
    auth: "required",
    scope: "access:write",
    input: z.strictObject({ body: AuthRevokeClientSessionInput }),
    success: AuthRevokeResult,
  }),
  "auth.revokeOtherClients": defineRoute({
    method: "POST",
    path: "/api/auth/clients/revoke-others",
    auth: "required",
    scope: "access:write",
    input: NoInput,
    success: AuthOtherClientSessionsRevokeResult,
  }),
};
