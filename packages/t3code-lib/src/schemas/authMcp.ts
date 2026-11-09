// ---
// relationships:
//   implements: library
// ---
/**
 * Mirrors the `AuthMcp*` schemas of `packages/contracts/src/auth.ts`: how an MCP client registers
 * and gets a token with OAuth. The server validates the request fields, so a test or a client can
 * send a bad value and read the refusal. Results stay open for a newer server.
 */
import { z } from "zod";

import { AuthMcpClientAccess, AuthMcpClientGrantedAccess, AuthGrantedScope } from "./auth.ts";
import { TrimmedNonEmptyString, forwardCompatibleLiteral } from "./common.ts";
import { RuntimeMode } from "./provider.ts";

const CodeResponseType = forwardCompatibleLiteral(["code"]);
const AuthorizationCodeGrantType = forwardCompatibleLiteral(["authorization_code"]);

export const AuthMcpProtectedResourceMetadata = z.looseObject({
  resource: z.string(),
  authorization_servers: z.array(z.string()),
  scopes_supported: z.array(AuthGrantedScope),
  bearer_methods_supported: z.array(forwardCompatibleLiteral(["header"])),
  resource_name: z.string(),
});
export type AuthMcpProtectedResourceMetadata = z.infer<typeof AuthMcpProtectedResourceMetadata>;

export const AuthMcpAuthorizationServerMetadata = z.looseObject({
  issuer: z.string(),
  authorization_endpoint: z.string(),
  token_endpoint: z.string(),
  registration_endpoint: z.string(),
  response_types_supported: z.array(CodeResponseType),
  grant_types_supported: z.array(AuthorizationCodeGrantType),
  code_challenge_methods_supported: z.array(forwardCompatibleLiteral(["S256"])),
  token_endpoint_auth_methods_supported: z.array(forwardCompatibleLiteral(["none"])),
  scopes_supported: z.array(AuthGrantedScope),
  authorization_response_iss_parameter_supported: z.boolean(),
});
export type AuthMcpAuthorizationServerMetadata = z.infer<typeof AuthMcpAuthorizationServerMetadata>;

/** `software_id` `t3code-peer-link` makes the session a peer link, which only adds limits. */
export const AuthMcpClientRegistration = z.strictObject({
  client_name: z.string().optional(),
  software_id: z.string().optional(),
  redirect_uris: z.array(z.string()).optional(),
  token_endpoint_auth_method: z.string().optional(),
});
export type AuthMcpClientRegistration = z.infer<typeof AuthMcpClientRegistration>;

export const AuthMcpRegisteredClient = z.looseObject({
  client_id: z.string(),
  client_name: z.string(),
  redirect_uris: z.array(z.string()),
  grant_types: z.array(AuthorizationCodeGrantType),
  response_types: z.array(CodeResponseType),
  token_endpoint_auth_method: forwardCompatibleLiteral(["none"]),
});
export type AuthMcpRegisteredClient = z.infer<typeof AuthMcpRegisteredClient>;

/** The query of `authorize`, and the body of `approval`. Every field is optional on the wire. */
export const AuthMcpAuthorizationRequest = z.strictObject({
  response_type: z.string().optional(),
  client_id: z.string().optional(),
  redirect_uri: z.string().optional(),
  code_challenge: z.string().optional(),
  code_challenge_method: z.string().optional(),
  state: z.string().optional(),
  resource: z.string().optional(),
});
export type AuthMcpAuthorizationRequest = z.infer<typeof AuthMcpAuthorizationRequest>;

/** The answer of `authorize`: where the server sends the browser. */
export const AuthMcpAuthorizationRedirect = z.looseObject({ location: z.string() });
export type AuthMcpAuthorizationRedirect = z.infer<typeof AuthMcpAuthorizationRedirect>;

/** A request that the server validated, for display. `clientName` is what the client declared. */
export const AuthMcpApprovalDetails = z.looseObject({
  clientName: z.string(),
  redirectHost: z.string(),
  environmentHost: z.string(),
  /** Only with a browser session that can approve. */
  csrfToken: z.string().optional(),
  /** The access that this browser session can approve. The rest needs a pairing code. */
  oneClickAccess: z.array(AuthMcpClientGrantedAccess).optional(),
  /** A managed policy's runtime-mode ceiling, for a page that loads without the server config. */
  runtimeModeCeiling: z
    .looseObject({ organization: z.string(), maxRuntimeMode: RuntimeMode })
    .optional(),
});
export type AuthMcpApprovalDetails = z.infer<typeof AuthMcpApprovalDetails>;

/** Where to send the browser. After an approval, `redirectTo` holds the one-use code. */
export const AuthMcpApprovalRedirect = z.looseObject({ redirectTo: z.string() });
export type AuthMcpApprovalRedirect = z.infer<typeof AuthMcpApprovalRedirect>;

export const AuthMcpApprovalResult = z.union([AuthMcpApprovalDetails, AuthMcpApprovalRedirect]);
export type AuthMcpApprovalResult = z.infer<typeof AuthMcpApprovalResult>;

export const AuthMcpApprovalDecision = z.discriminatedUnion("_tag", [
  z.strictObject({ _tag: z.literal("deny") }),
  z.strictObject({
    _tag: z.literal("pairing-code"),
    access: AuthMcpClientAccess,
    code: TrimmedNonEmptyString,
  }),
  z.strictObject({
    _tag: z.literal("browser-session"),
    access: AuthMcpClientAccess,
    csrfToken: z.string(),
  }),
]);
export type AuthMcpApprovalDecision = z.infer<typeof AuthMcpApprovalDecision>;

export const AuthMcpApprovalDecisionRequest = z.strictObject({
  authorization: AuthMcpAuthorizationRequest,
  decision: AuthMcpApprovalDecision,
});
export type AuthMcpApprovalDecisionRequest = z.infer<typeof AuthMcpApprovalDecisionRequest>;

/** The form body of `POST /oauth/mcp/token`. */
export const AuthMcpTokenRequest = z.strictObject({
  grant_type: z.string().optional(),
  code: z.string().optional(),
  redirect_uri: z.string().optional(),
  client_id: z.string().optional(),
  code_verifier: z.string().optional(),
  resource: z.string().optional(),
});
export type AuthMcpTokenRequest = z.infer<typeof AuthMcpTokenRequest>;

export const AuthMcpTokenResult = z.looseObject({
  access_token: z.string(),
  token_type: forwardCompatibleLiteral(["Bearer"]),
  expires_in: z.number(),
  scope: z.string(),
});
export type AuthMcpTokenResult = z.infer<typeof AuthMcpTokenResult>;
