// ---
// relationships:
//   verifies: library-auth
// ---
/**
 * The auth foundation on a real stock server: a proof-bound session, browser
 * sessions, tickets for one use, and desktop bootstrap credentials.
 */
import { afterAll, beforeAll, describe, expect, it } from "vite-plus/test";
import { WebSocket as WsWebSocket } from "ws";
import type { WebSocketConstructor } from "../../src/internal/websocket.ts";
import {
  T3AuthError,
  T3Client,
  createDpopProof,
  currentDesktopBootstrapToken,
  generateDpopKey,
  memoryCredentialStore,
} from "../../src/index.ts";
import type { AuthGrantScope } from "../../src/schemas/auth.ts";
import { connect, hasLiveServer } from "./liveClient.ts";
import { startDesktopServer, type DesktopServer } from "./desktopServer.ts";

const webSocket = WsWebSocket as unknown as WebSocketConstructor;

const baseUrl = () => process.env["T3_LIVE_URL"] ?? "";

const session = (url: string, options: Partial<Parameters<typeof T3Client.create>[0]> = {}) =>
  T3Client.create({ baseUrl: url, webSocket, credentials: memoryCredentialStore(), ...options });

/** Whether a socket upgrade with this ticket opens. */
const upgradeOpens = (url: string, ticket: string, proof?: string) =>
  new Promise<boolean>((resolve) => {
    const target = new URL("/ws", url);
    target.protocol = "ws:";
    target.searchParams.set("orchestrationProtocol", "2");
    target.searchParams.set("wsTicket", ticket);
    if (proof !== undefined) target.searchParams.set("dpop", proof);
    const socket = new WsWebSocket(target);
    socket.once("open", () => {
      socket.close();
      resolve(true);
    });
    socket.once("error", () => resolve(false));
  });

describe.skipIf(!hasLiveServer)("auth foundation", () => {
  const admin = connect();

  afterAll(() => admin.close());

  const pair = async (scopes?: AuthGrantScope[]) =>
    (
      await admin.auth.createPairingCredential({
        label: "live auth test",
        ...(scopes === undefined ? {} : { scopes }),
      })
    ).credential;

  it("binds a session to a key and uses it over HTTP and both socket modes", async () => {
    const dpopKey = generateDpopKey();
    const store = memoryCredentialStore();
    const client = session(baseUrl(), { credentials: store });
    const issued = await client.auth.exchangePairingToken(await pair(), { dpopKey });
    expect(issued.token_type).toBe("DPoP");
    expect(await client.auth.sessionState()).toMatchObject({
      authenticated: true,
      sessionMethod: "dpop-access-token",
    });
    expect((await client.projects.snapshot()).projects).toBeInstanceOf(Array);
    expect(await client.rpc.call("server.probe", {})).toBeDefined();
    await client.close();

    const bearerHeader = session(baseUrl(), { credentials: store, socketAuth: "bearer-header" });
    expect(await bearerHeader.rpc.call("server.probe", {})).toBeDefined();
    await bearerHeader.close();
  });

  it("refuses a bound token without its proof, with the wrong key, and on replay", async () => {
    const dpopKey = generateDpopKey();
    const client = session(baseUrl());
    const { access_token: token } = await client.auth.exchangePairingToken(await pair(), {
      dpopKey,
    });

    const asBearer = T3Client.create({ baseUrl: baseUrl(), accessToken: token, webSocket });
    await expect(asBearer.routes.call("projects.snapshot")).rejects.toBeInstanceOf(T3AuthError);
    await asBearer.close();

    const wrongKey = session(baseUrl(), {
      credentials: memoryCredentialStore({ accessToken: token, dpopKey: generateDpopKey() }),
    });
    await expect(wrongKey.routes.call("projects.snapshot")).rejects.toMatchObject({
      code: "auth_invalid",
      body: { dpopFailureReason: "key_mismatch" },
    });
    await wrongKey.close();

    let captured: { url: string; init: RequestInit } | undefined;
    const capture = session(baseUrl(), {
      credentials: memoryCredentialStore({ accessToken: token, dpopKey }),
      fetch: (async (input: URL, init: RequestInit) => {
        captured = { url: input.toString(), init };
        return fetch(input, init);
      }) as typeof fetch,
    });
    await capture.routes.call("projects.snapshot");
    await capture.close();
    if (captured === undefined) throw new Error("The request was not captured.");
    const replay = await fetch(captured.url, captured.init);
    expect(replay.status).toBe(401);
    expect(await replay.json()).toMatchObject({ dpopFailureReason: "replay" });
    expect(replay.headers.get("www-authenticate")).toBe("DPoP");
    await client.close();
  });

  it("uses a browser session through a client whose fetch keeps the cookie", async () => {
    let cookie = "";
    const client = session(baseUrl(), {
      fetchAuthenticates: true,
      fetch: (async (input: URL, init: RequestInit) => {
        const headers = new Headers(init.headers);
        if (cookie !== "") headers.set("cookie", cookie);
        const response = await fetch(input, { ...init, headers });
        const setCookie = response.headers.get("set-cookie");
        if (setCookie !== null) cookie = setCookie.split(";")[0] ?? "";
        return response;
      }) as typeof fetch,
    });
    const result = await client.routes.call("auth.browserSession", {
      body: { credential: await pair(["orchestration:read", "orchestration:operate"]) },
    });
    expect(result).toMatchObject({
      authenticated: true,
      sessionMethod: "browser-session-cookie",
    });
    expect(await client.auth.sessionState()).toMatchObject({
      authenticated: true,
      sessionMethod: "browser-session-cookie",
    });
    expect((await client.routes.call("projects.snapshot")).projects).toBeInstanceOf(Array);
    expect(await client.rpc.call("server.probe", {})).toBeDefined();
    await client.close();

    const unused = session(baseUrl());
    await expect(
      unused.routes.call("auth.browserSession", { body: { credential: "sample-unknown" } }),
    ).rejects.toMatchObject({ code: "auth_invalid" });
    await expect(unused.routes.call("projects.snapshot")).rejects.toMatchObject({
      reason: "missing_credential",
    });
    await unused.close();
  });

  it("refuses the RPC ticket of a bound session without its proof", async () => {
    const dpopKey = generateDpopKey();
    const client = session(baseUrl());
    await client.auth.exchangePairingToken(await pair(), { dpopKey });
    const proofFor = (ticket: string, key = dpopKey) =>
      createDpopProof({ key, method: "GET", url: new URL("/ws", baseUrl()), accessToken: ticket });
    const mint = async () =>
      (await client.routes.call("auth.webSocketTicketFor", { params: { use: "rpc" } })).ticket;

    expect(await upgradeOpens(baseUrl(), await mint())).toBe(false);
    const other = await mint();
    expect(await upgradeOpens(baseUrl(), other, proofFor(other, generateDpopKey()))).toBe(false);
    const good = await mint();
    expect(await upgradeOpens(baseUrl(), good, proofFor(good))).toBe(true);
    // The default socket path of a bound session mints this kind of ticket.
    expect(await client.rpc.call("server.probe", {})).toBeDefined();
    await client.close();
  });

  it("mints a ticket for one use, which the other route refuses", async () => {
    const rpc = await admin.routes.call("auth.webSocketTicketFor", { params: { use: "rpc" } });
    expect(await upgradeOpens(baseUrl(), rpc.ticket)).toBe(true);
    const media = await admin.routes.call("auth.webSocketTicketFor", { params: { use: "media" } });
    expect(await upgradeOpens(baseUrl(), media.ticket)).toBe(false);
  });
});

describe.skipIf(!hasLiveServer)("desktop bootstrap", () => {
  const secret = "sample-desktop-secret";
  let seeded: DesktopServer;
  let rotating: DesktopServer;

  beforeAll(async () => {
    seeded = await startDesktopServer({ desktopBootstrapToken: "sample-seed-token" });
    rotating = await startDesktopServer({
      desktopBootstrapToken: "sample-unused-token",
      desktopBootstrapSecret: secret,
    });
  }, 120_000);

  afterAll(async () => {
    await seeded?.stop();
    await rotating?.stop();
  });

  it("exchanges a seeded token more than once", async () => {
    const client = session(seeded.baseUrl);
    const state = await client.auth.sessionState();
    expect(state.auth).toMatchObject({
      policy: "desktop-managed-local",
      bootstrapMethods: ["desktop-bootstrap"],
    });
    const first = await client.auth.exchangePairingToken("sample-seed-token");
    expect(first.token_type).toBe("Bearer");
    expect(await client.rpc.call("server.probe", {})).toBeDefined();
    const second = await client.auth.exchangePairingToken("sample-seed-token");
    expect(second.access_token).not.toBe(first.access_token);
    await client.close();
  });

  it("exchanges a token derived from the secret, with a proof, and refuses another", async () => {
    const client = session(rotating.baseUrl);
    const issued = await client.auth.exchangePairingToken(currentDesktopBootstrapToken(secret), {
      dpopKey: generateDpopKey(),
    });
    expect(issued.token_type).toBe("DPoP");
    expect(await client.auth.sessionState()).toMatchObject({
      authenticated: true,
      sessionMethod: "dpop-access-token",
    });
    await expect(
      client.auth.exchangePairingToken(currentDesktopBootstrapToken("sample-other-secret")),
    ).rejects.toMatchObject({ code: "auth_invalid" });
    await client.close();
  });

  it("creates a browser session from a desktop token", async () => {
    const client = session(rotating.baseUrl);
    const result = await client.routes.call("auth.browserSession", {
      body: { credential: currentDesktopBootstrapToken(secret) },
    });
    expect(result.sessionMethod).toBe("browser-session-cookie");
    await client.close();
  });
});
