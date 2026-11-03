// ---
// relationships:
//   verifies: library-transport
// ---
/**
 * The T3 Connect routes of a real server, with this test as the relay: a local key signs what
 * the relay signs, and the relay's address does not resolve, so no relay is reached.
 */
import * as NodeCrypto from "node:crypto";
import * as NodeFSP from "node:fs/promises";
import * as NodePath from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vite-plus/test";
import { WebSocket as WsWebSocket } from "ws";
import {
  T3AuthError,
  T3Client,
  T3HttpError,
  generateDpopKey,
  memoryCredentialStore,
  schemas,
} from "../../src/index.ts";
import type { WebSocketConstructor } from "../../src/internal/websocket.ts";
import { hasLiveServer } from "./liveClient.ts";
import { type PeerServer, startScratchServer, withScopes } from "./peerServer.ts";
import { relayKeys, verifiedClaims } from "./relayKeys.ts";

const webSocket = WsWebSocket as unknown as WebSocketConstructor;
const RELAY_URL = "https://relay.invalid";
const CLOUD_USER = "sample-cloud-user";
const HEALTH_TYP = "t3-cloud-health+jwt";
const MINT_TYP = "t3-cloud-mint+jwt";

const httpFailure = async (promise: Promise<unknown>) => {
  const error = await promise.then(
    () => undefined,
    (reason: unknown) => reason,
  );
  if (!(error instanceof T3HttpError))
    throw new Error(`Expected a T3HttpError, got ${String(error)}`);
  return error;
};

describe.skipIf(!hasLiveServer)("live T3 Connect routes", () => {
  let server: PeerServer;
  const relay = relayKeys();
  const config = (overrides: Record<string, unknown> = {}) => ({
    relayUrl: RELAY_URL,
    cloudUserId: CLOUD_USER,
    environmentCredential: "sample-environment-credential",
    cloudMintPublicKey: relay.publicKey,
    endpointRuntime: null,
    ...overrides,
  });
  const proofClaims = async (scope: string, overrides: Record<string, unknown> = {}) => {
    const { environmentId } = await server.client.server.environment();
    const now = Math.floor(Date.now() / 1_000);
    return {
      iss: RELAY_URL,
      aud: `t3-env:${environmentId}`,
      sub: CLOUD_USER,
      jti: NodeCrypto.randomUUID(),
      iat: now,
      exp: now + 60,
      environmentId,
      nonce: NodeCrypto.randomUUID(),
      scope: [scope],
      ...overrides,
    };
  };

  beforeAll(async () => {
    server = await startScratchServer("t3code-lib-connect-");
  });
  afterAll(async () => {
    await server.stop();
  });

  it("reports a server with no link, and refuses what needs one", async () => {
    const { routes } = server.client;
    expect(await routes.call("connect.linkState")).toMatchObject({
      linked: false,
      cloudUserId: null,
      relayUrl: null,
      relayIssuer: null,
      managedTunnelActive: false,
      publishAgentActivity: false,
    });
    expect(await routes.call("connect.checkReachability")).toMatchObject({
      status: "unreachable",
      cause: "not_linked",
      hint: null,
    });
    expect(
      await routes.call("connect.preferences", { body: { publishAgentActivity: true } }),
    ).toMatchObject({ linked: false, publishAgentActivity: true });
    const refused = await httpFailure(
      routes.call("connect.preferences", {
        body: { publishAgentActivity: true, holdWebhooksWhileOffline: true },
      }),
    );
    expect(refused).toMatchObject({ status: 400, tag: "EnvironmentHttpBadRequestError" });
    expect(schemas.httpErrors.EnvironmentHttpCloudError.safeParse(refused.body).success).toBe(true);
  });

  it("signs a link proof for its own origin, and refuses another", async () => {
    const { routes } = server.client;
    const port = Number(new URL(server.baseUrl).port);
    const request = {
      challenge: "sample-challenge",
      relayIssuer: RELAY_URL,
      endpoint: {
        httpBaseUrl: "https://endpoint.invalid",
        wsBaseUrl: "wss://endpoint.invalid",
        providerKind: "cloudflare_tunnel",
      },
      origin: { localHttpHost: "127.0.0.1", localHttpPort: port },
    } as const;
    const proof = await routes.call("connect.linkProof", { body: request });
    const [, encoded = ""] = proof.split(".");
    const unverified = JSON.parse(Buffer.from(encoded, "base64url").toString()) as {
      environmentPublicKey: string;
    };
    const { environmentId } = await server.client.server.environment();
    expect(verifiedClaims(proof, unverified.environmentPublicKey)).toMatchObject({
      typ: "t3-env-link+jwt",
      claims: {
        aud: RELAY_URL,
        challenge: request.challenge,
        environmentId,
        scopes: ["agent_activity_notifications", "managed_tunnels"],
      },
    });
    const otherPort = port === 65_535 ? port - 1 : port + 1;
    const refused = await httpFailure(
      routes.call("connect.linkProof", {
        body: { ...request, origin: { localHttpHost: "127.0.0.1", localHttpPort: otherPort } },
      }),
    );
    expect(refused).toMatchObject({ status: 400, tag: "EnvironmentHttpBadRequestError" });
  });

  it("links, answers the relay's proofs, and unlinks", async () => {
    const { routes } = server.client;
    const refusedUrl = await httpFailure(
      routes.call("connect.relayConfig", { body: config({ relayUrl: "http://relay.invalid" }) }),
    );
    expect(refusedUrl).toMatchObject({ status: 400, tag: "EnvironmentHttpBadRequestError" });

    const linked = await routes.call("connect.relayConfig", { body: config() });
    expect(linked).toEqual({ ok: true, endpointRuntimeStatus: { status: "disabled" } });
    expect(await routes.call("connect.linkState")).toMatchObject({
      linked: true,
      cloudUserId: CLOUD_USER,
      relayUrl: RELAY_URL,
      relayIssuer: RELAY_URL,
      managedTunnelActive: false,
      linkRevoked: false,
    });

    const otherUser = await httpFailure(
      routes.call("connect.relayConfig", { body: config({ cloudUserId: "sample-other-user" }) }),
    );
    expect(otherUser).toMatchObject({ status: 409, tag: "EnvironmentHttpConflictError" });

    const unavailable = await httpFailure(
      routes.call("connect.relayConfig", {
        body: config({
          endpointRuntime: { providerKind: "t3_relay", connectorToken: "sample-connector" },
        }),
      }),
    );
    expect(unavailable).toMatchObject({
      status: 503,
      tag: "EnvironmentCloudEndpointUnavailableError",
      body: { endpointRuntimeStatus: { status: "unsupported", providerKind: "t3_relay" } },
    });

    // The relay's two calls carry no session: the signed proof is what the server checks.
    const anonymous = T3Client.create({
      baseUrl: server.baseUrl,
      webSocket,
      credentials: memoryCredentialStore(),
    });
    try {
      const healthProof = relay.sign(HEALTH_TYP, await proofClaims("environment:status"));
      const health = await anonymous.routes.call("connect.health", {
        body: { proof: healthProof },
      });
      const { environmentId } = await server.client.server.environment();
      expect(health).toMatchObject({ environmentId, status: "online" });
      expect(health.descriptor.environmentId).toBe(environmentId);
      const replay = await httpFailure(
        anonymous.routes.call("connect.health", { body: { proof: healthProof } }),
      );
      expect(replay).toMatchObject({ status: 409, tag: "EnvironmentHttpConflictError" });
      const otherKey = await httpFailure(
        anonymous.routes.call("connect.health", {
          body: { proof: relayKeys().sign(HEALTH_TYP, await proofClaims("environment:status")) },
        }),
      );
      expect(otherKey).toMatchObject({ status: 401, tag: "EnvironmentHttpUnauthorizedError" });

      const dpopKey = generateDpopKey();
      const thumbprint = NodeCrypto.createHash("sha256")
        .update(JSON.stringify({ crv: dpopKey.crv, kty: dpopKey.kty, x: dpopKey.x, y: dpopKey.y }))
        .digest("base64url");
      const minted = await anonymous.routes.call("connect.mintCredential", {
        body: {
          proof: relay.sign(
            MINT_TYP,
            await proofClaims("environment:connect", {
              clientProofKeyThumbprint: thumbprint,
              cnf: { jkt: thumbprint },
            }),
          ),
        },
      });
      expect(Date.parse(minted.expiresAt)).toBeGreaterThan(Date.now());
      const issued = await anonymous.auth.exchangePairingToken(minted.credential, { dpopKey });
      expect(issued.token_type).toBe("DPoP");
    } finally {
      await anonymous.close();
    }

    expect(await routes.call("connect.unlink")).toEqual({
      ok: true,
      endpointRuntimeStatus: { status: "disabled" },
    });
    expect(await routes.call("connect.linkState")).toMatchObject({
      linked: false,
      publishAgentActivity: false,
    });
  });

  it("reports a tunnel that the relay cannot confirm, and a relay it cannot reach", async () => {
    const tunnel = await startScratchServer("t3code-lib-connect-", async (home) => {
      const path = NodePath.join(home, "sample-tunnel-client");
      await NodeFSP.writeFile(path, '#!/bin/sh\necho "cloudflared version 2099.1.0"\n', {
        mode: 0o755,
      });
      return { T3CODE_CLOUDFLARED_PATH: path };
    });
    try {
      const { routes } = tunnel.client;
      const refused = await httpFailure(
        routes.call("connect.relayConfig", {
          body: config({
            endpointRuntime: {
              providerKind: "cloudflare_tunnel",
              connectorToken: "sample-connector",
            },
          }),
        }),
      );
      expect(refused).toMatchObject({
        status: 503,
        tag: "EnvironmentCloudEndpointUnavailableError",
        body: { endpointRuntimeStatus: { status: "disabled" } },
      });
      expect(await routes.call("connect.linkState")).toMatchObject({
        linked: true,
        managedTunnelActive: true,
      });
      expect(await routes.call("connect.checkReachability")).toMatchObject({
        status: "unreachable",
        cause: "connector_not_running",
      });
      const unreachable = await httpFailure(
        routes.call("connect.preferences", {
          body: { publishAgentActivity: true, holdWebhooksWhileOffline: true },
        }),
      );
      expect(unreachable).toMatchObject({
        status: 500,
        tag: "EnvironmentHttpInternalServerError",
      });
      expect(await routes.call("connect.linkState")).toMatchObject({
        publishAgentActivity: false,
        holdWebhooksWhileOffline: false,
      });
      expect(await routes.call("connect.unlink")).toMatchObject({ ok: true });
    } finally {
      await tunnel.stop();
    }
  });

  it("holds each route to the server's scope", async () => {
    await withScopes(server, ["relay:read"], async (reader) => {
      expect(await reader.routes.call("connect.linkState")).toMatchObject({ linked: false });
      await expect(reader.routes.call("connect.unlink")).rejects.toBeInstanceOf(T3AuthError);
    });
    await withScopes(server, ["orchestration:read"], async (other) => {
      await expect(other.routes.call("connect.linkState")).rejects.toBeInstanceOf(T3AuthError);
    });
  });
});
