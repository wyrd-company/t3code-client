// ---
// relationships:
//   implements: library-wire
// ---
/**
 * How an MCP client gets a token with OAuth. A client that has no session yet calls them, so most
 * send no token. `approval` and `decision` send the session's token when there is one: the server
 * approves for a session with `access:write` and `orchestration:read`, from its token or from a
 * browser session cookie. A client that approves with a cookie needs a `fetch` that keeps it.
 */
import { z } from "zod";

import {
  AuthMcpApprovalDecisionRequest,
  AuthMcpApprovalRedirect,
  AuthMcpApprovalResult,
  AuthMcpAuthorizationRedirect,
  AuthMcpAuthorizationRequest,
  AuthMcpAuthorizationServerMetadata,
  AuthMcpClientRegistration,
  AuthMcpProtectedResourceMetadata,
  AuthMcpRegisteredClient,
  AuthMcpTokenRequest,
  AuthMcpTokenResult,
} from "../../schemas/authMcp.ts";
import { defineRoute } from "../spec.ts";

const NoInput = z.undefined();

export const mcpOAuthRoutes = {
  "mcpOAuth.protectedResource": defineRoute({
    method: "GET",
    path: "/.well-known/oauth-protected-resource",
    auth: "none",
    input: NoInput,
    success: AuthMcpProtectedResourceMetadata,
  }),
  "mcpOAuth.mcpProtectedResource": defineRoute({
    method: "GET",
    path: "/.well-known/oauth-protected-resource/mcp",
    auth: "none",
    input: NoInput,
    success: AuthMcpProtectedResourceMetadata,
  }),
  "mcpOAuth.authorizationServer": defineRoute({
    method: "GET",
    path: "/.well-known/oauth-authorization-server",
    auth: "none",
    input: NoInput,
    success: AuthMcpAuthorizationServerMetadata,
  }),
  "mcpOAuth.register": defineRoute({
    method: "POST",
    path: "/oauth/mcp/register",
    auth: "none",
    input: z.strictObject({ body: AuthMcpClientRegistration }),
    success: AuthMcpRegisteredClient,
  }),
  "mcpOAuth.authorize": defineRoute({
    method: "GET",
    path: "/oauth/mcp/authorize",
    auth: "none",
    input: z.strictObject({ query: AuthMcpAuthorizationRequest }),
    success: AuthMcpAuthorizationRedirect,
    redirectResponse: true,
    signedPath: true,
  }),
  "mcpOAuth.approval": defineRoute({
    method: "POST",
    path: "/oauth/mcp/approval",
    auth: "optional",
    input: z.strictObject({ body: AuthMcpAuthorizationRequest }),
    success: AuthMcpApprovalResult,
  }),
  "mcpOAuth.decision": defineRoute({
    method: "POST",
    path: "/oauth/mcp/decision",
    auth: "optional",
    input: z.strictObject({ body: AuthMcpApprovalDecisionRequest }),
    success: AuthMcpApprovalRedirect,
  }),
  "mcpOAuth.token": defineRoute({
    method: "POST",
    path: "/oauth/mcp/token",
    auth: "none",
    form: true,
    input: z.strictObject({ body: AuthMcpTokenRequest }),
    success: AuthMcpTokenResult,
  }),
};
