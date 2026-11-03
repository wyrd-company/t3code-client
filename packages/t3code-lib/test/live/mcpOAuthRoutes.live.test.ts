// ---
// relationships:
//   verifies: library-wire
// ---
/**
 * The OAuth routes of an MCP client on a real server, from the first refused request to a token
 * that the server's `/mcp` endpoint accepts. The redirect target is a sample address that no test
 * calls.
 */
import * as NodeCrypto from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vite-plus/test";
import { T3Client, T3HttpError, T3PreconditionError } from "../../src/index.ts";
import type { AuthMcpAuthorizationRequest } from "../../src/schemas/authMcp.ts";
import { hasLiveServer } from "./liveClient.ts";
import { guestClient } from "./guestTunnel.ts";
import { type PeerServer, startPeerServer } from "./peerServer.ts";

const REDIRECT = "http://127.0.0.1:9/sample-callback";
const VERIFIER = "sample-verifier-".repeat(4);
const CHALLENGE = NodeCrypto.createHash("sha256").update(VERIFIER).digest("base64url");

const failure = async (promise: Promise<unknown>) =>
  promise.then(
    () => {
      throw new Error("Expected a refusal.");
    },
    (error: unknown) => error,
  );

const httpFailure = async (promise: Promise<unknown>) => {
  const error = await failure(promise);
  expect(error).toBeInstanceOf(T3HttpError);
  return error as T3HttpError;
};

describe.skipIf(!hasLiveServer)("live MCP OAuth routes", () => {
  let server: PeerServer;
  let anonymous: T3Client;
  let clientId: string;
  let authorization: AuthMcpAuthorizationRequest;

  beforeAll(async () => {
    server = await startPeerServer();
    anonymous = T3Client.create({ baseUrl: server.baseUrl });
    const client = await anonymous.routes.call("mcpOAuth.register", {
      body: { client_name: "Sample client", redirect_uris: [REDIRECT] },
    });
    clientId = client.client_id;
    authorization = {
      response_type: "code",
      client_id: clientId,
      redirect_uri: REDIRECT,
      code_challenge: CHALLENGE,
      code_challenge_method: "S256",
      state: "sample-state",
    };
  }, 90_000);
  afterAll(async () => {
    await anonymous?.close();
    await server?.stop();
  });

  const mcpStatus = async (token?: string) => {
    const response = await fetch(new URL("/mcp", server.baseUrl), {
      method: "POST",
      headers: {
        accept: "application/json, text/event-stream",
        "content-type": "application/json",
        ...(token === undefined ? {} : { authorization: `Bearer ${token}` }),
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "initialize",
        params: {
          protocolVersion: "2025-06-18",
          capabilities: {},
          clientInfo: { name: "sample", version: "1.0.0" },
        },
      }),
    });
    await response.body?.cancel();
    return response;
  };

  /** A pairing code's approval: the query of the redirect that holds the one-use code. */
  const approve = async (access: "read-only" | "auto" = "auto") => {
    const { credential } = await server.client.auth.createPairingCredential({
      label: "Sample approval",
      scopes: ["orchestration:read", "orchestration:operate"],
    });
    const { redirectTo } = await anonymous.routes.call("mcpOAuth.decision", {
      body: { authorization, decision: { _tag: "pairing-code", access, code: credential } },
    });
    return new URL(redirectTo).searchParams;
  };

  it("answers the metadata that names the routes", async () => {
    const issuer = new URL(server.baseUrl).origin;
    const expected = {
      resource: `${issuer}/mcp`,
      authorization_servers: [issuer],
      scopes_supported: ["orchestration:read", "orchestration:operate"],
      bearer_methods_supported: ["header"],
    };
    await expect(anonymous.routes.call("mcpOAuth.protectedResource")).resolves.toMatchObject(
      expected,
    );
    await expect(anonymous.routes.call("mcpOAuth.mcpProtectedResource")).resolves.toMatchObject(
      expected,
    );
    await expect(anonymous.routes.call("mcpOAuth.authorizationServer")).resolves.toMatchObject({
      issuer,
      authorization_endpoint: `${issuer}/oauth/mcp/authorize`,
      token_endpoint: `${issuer}/oauth/mcp/token`,
      registration_endpoint: `${issuer}/oauth/mcp/register`,
      response_types_supported: ["code"],
      grant_types_supported: ["authorization_code"],
      code_challenge_methods_supported: ["S256"],
      token_endpoint_auth_methods_supported: ["none"],
      authorization_response_iss_parameter_supported: true,
    });
    const refused = await mcpStatus();
    expect(refused.status).toBe(401);
    expect(refused.headers.get("www-authenticate")).toContain(
      `${issuer}/.well-known/oauth-protected-resource/mcp`,
    );
  });

  it("registers a client, and refuses a bad redirect or a peer link that is turned off", async () => {
    const client = await anonymous.routes.call("mcpOAuth.register", {
      body: {
        client_name: "Sample",
        redirect_uris: [REDIRECT],
        token_endpoint_auth_method: "none",
      },
    });
    expect(client).toMatchObject({
      client_name: "Sample",
      redirect_uris: [REDIRECT],
      grant_types: ["authorization_code"],
      response_types: ["code"],
      token_endpoint_auth_method: "none",
    });

    const badRedirect = await httpFailure(
      anonymous.routes.call("mcpOAuth.register", {
        body: { redirect_uris: ["http://host.invalid/callback"] },
      }),
    );
    expect(badRedirect).toMatchObject({ status: 400, reason: "invalid_redirect_uri" });

    const noRedirect = await httpFailure(anonymous.routes.call("mcpOAuth.register", { body: {} }));
    expect(noRedirect.reason).toBe("invalid_redirect_uri");

    const peer = await httpFailure(
      anonymous.routes.call("mcpOAuth.register", {
        body: { software_id: "t3code-peer-link", redirect_uris: [REDIRECT] },
      }),
    );
    expect(peer.reason).toBe("invalid_client_metadata");
  });

  it("answers an authorize request with each of its three outcomes", async () => {
    const page = await anonymous.routes.call("mcpOAuth.authorize", { query: authorization });
    const pageUrl = new URL(page.location, server.baseUrl);
    expect(pageUrl.pathname).toBe("/connect-agent");
    expect(pageUrl.searchParams.get("state")).toBe("sample-state");

    const back = await anonymous.routes.call("mcpOAuth.authorize", {
      query: { ...authorization, code_challenge: "too-short" },
    });
    const backUrl = new URL(back.location);
    expect(`${backUrl.origin}${backUrl.pathname}`).toBe(REDIRECT);
    expect(backUrl.searchParams.get("error")).toBe("invalid_request");
    expect(backUrl.searchParams.get("state")).toBe("sample-state");

    const unknown = await httpFailure(
      anonymous.routes.call("mcpOAuth.authorize", {
        query: { ...authorization, client_id: "sample-unknown" },
      }),
    );
    expect(unknown.status).toBe(400);
    expect(unknown.body).toEqual(expect.stringContaining("unknown app"));
  });

  it("answers an approval request with its details, a redirect or a refusal", async () => {
    await expect(
      anonymous.routes.call("mcpOAuth.approval", { body: authorization }),
    ).resolves.toEqual({
      clientName: "Sample client",
      redirectHost: new URL(REDIRECT).host,
      environmentHost: new URL(server.baseUrl).host,
    });

    const redirected = await anonymous.routes.call("mcpOAuth.approval", {
      body: { ...authorization, response_type: "token" },
    });
    expect(redirected).toMatchObject({
      redirectTo: expect.stringContaining("error=unsupported_response_type"),
    });

    const refused = await httpFailure(
      anonymous.routes.call("mcpOAuth.approval", { body: { client_id: "sample-unknown" } }),
    );
    expect(refused).toMatchObject({ status: 400, tag: "AuthMcpApprovalError" });
  });

  it("sends a denial back to the client", async () => {
    const { redirectTo } = await anonymous.routes.call("mcpOAuth.decision", {
      body: { authorization, decision: { _tag: "deny" } },
    });
    const url = new URL(redirectTo);
    expect(url.searchParams.get("error")).toBe("access_denied");
    expect(url.searchParams.get("state")).toBe("sample-state");
    expect(url.searchParams.get("iss")).toBe(new URL(server.baseUrl).origin);
  });

  it("exchanges a pairing code's approval for a token that /mcp accepts, once", async () => {
    const params = await approve();
    expect(params.get("state")).toBe("sample-state");
    const body = {
      grant_type: "authorization_code",
      code: params.get("code") ?? "",
      redirect_uri: REDIRECT,
      client_id: clientId,
      code_verifier: VERIFIER,
    };

    const token = await anonymous.routes.call("mcpOAuth.token", { body });

    expect(token).toMatchObject({
      token_type: "Bearer",
      scope: "orchestration:read orchestration:operate",
    });
    expect(token.expires_in).toBeGreaterThan(0);
    expect((await mcpStatus(token.access_token)).status).toBe(200);

    const spent = await httpFailure(anonymous.routes.call("mcpOAuth.token", { body }));
    expect(spent).toMatchObject({ status: 400, reason: "invalid_grant" });
  });

  it("refuses the wrong verifier, grant and client, and spends the code", async () => {
    const params = await approve("read-only");
    const body = {
      grant_type: "authorization_code",
      code: params.get("code") ?? "",
      redirect_uri: REDIRECT,
      client_id: clientId,
      code_verifier: VERIFIER,
    };
    const reason = async (changed: Partial<typeof body>) =>
      (
        await httpFailure(
          anonymous.routes.call("mcpOAuth.token", { body: { ...body, ...changed } }),
        )
      ).reason;

    expect(await reason({ grant_type: "refresh_token" })).toBe("unsupported_grant_type");
    expect(await reason({ client_id: "sample-unknown" })).toBe("invalid_client");
    expect(await reason({ code_verifier: "" })).toBe("invalid_request");
    expect(await reason({ code_verifier: "other-verifier-".repeat(4) })).toBe("invalid_grant");
    expect(await reason({})).toBe("invalid_grant");
  });

  it("refuses a used pairing code in the page's words", async () => {
    const { credential } = await server.client.auth.createPairingCredential({
      label: "Sample approval",
      scopes: ["orchestration:read"],
    });
    const decide = () =>
      anonymous.routes.call("mcpOAuth.decision", {
        body: {
          authorization,
          decision: { _tag: "pairing-code", access: "full-access", code: credential },
        },
      });

    const narrow = await httpFailure(decide());
    expect(narrow).toMatchObject({ status: 400, tag: "AuthMcpApprovalError" });
    expect(JSON.stringify(narrow.body)).toContain("cannot grant this access");

    await anonymous.routes.call("mcpOAuth.decision", {
      body: {
        authorization,
        decision: { _tag: "pairing-code", access: "read-only", code: credential },
      },
    });
    expect(JSON.stringify((await httpFailure(decide())).body)).toContain("already used");
  });

  it("approves with a browser session, within the scopes it holds", async () => {
    const browser = guestClient(server.baseUrl);
    const { credential } = await server.client.auth.createPairingCredential({
      label: "Sample browser",
      scopes: ["orchestration:read", "orchestration:operate", "access:write"],
    });
    await browser.routes.call("auth.browserSession", { body: { credential } });

    const details = await browser.routes.call("mcpOAuth.approval", { body: authorization });
    expect(details).toMatchObject({
      csrfToken: expect.any(String),
      oneClickAccess: ["read-only", "approval-required", "auto-accept-edits", "auto"],
    });
    const csrfToken = "csrfToken" in details ? String(details.csrfToken) : "";

    const { redirectTo } = await browser.routes.call("mcpOAuth.decision", {
      body: { authorization, decision: { _tag: "browser-session", access: "auto", csrfToken } },
    });
    expect(new URL(redirectTo).searchParams.has("code")).toBe(true);

    const scoped = await httpFailure(
      browser.routes.call("mcpOAuth.decision", {
        body: {
          authorization,
          decision: { _tag: "browser-session", access: "full-access", csrfToken },
        },
      }),
    );
    expect(scoped.status).toBe(400);

    const noCookie = await httpFailure(
      anonymous.routes.call("mcpOAuth.decision", {
        body: { authorization, decision: { _tag: "browser-session", access: "auto", csrfToken } },
      }),
    );
    expect(noCookie.tag).toBe("AuthMcpApprovalError");
    await browser.close();
  });

  it("checks a request's input before it sends it", async () => {
    await expect(
      anonymous.routes.call("mcpOAuth.register", { body: { unknown_field: "sample" } } as never),
    ).rejects.toBeInstanceOf(T3PreconditionError);
  });
});
