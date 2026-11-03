// ---
// relationships:
//   verifies: proxy
// ---
/** Agents stay clean, and a person's hostname keeps the server's access rules over HTTPS. */
import * as NodeCrypto from "node:crypto";
import { afterAll, describe, expect, it } from "vite-plus/test";
import { WebSocket } from "ws";
import { byline, pairing, routes, until, urls } from "./proofSupport.ts";

const json = { "content-type": "application/json" };
const PROTOCOL = "/ws?orchestrationProtocol=2&clientSurface=web";

/** Completes the OAuth flow of an outside agent on one hostname and returns its MCP caller. */
async function outsideAgent(base: string) {
  const redirect = "http://127.0.0.1:9/callback";
  const registered = await fetch(`${base}/oauth/mcp/register`, {
    method: "POST",
    headers: json,
    body: JSON.stringify({
      redirect_uris: [redirect],
      client_name: "sample",
      token_endpoint_auth_method: "none",
      grant_types: ["authorization_code"],
      response_types: ["code"],
    }),
  }).then((response) => response.json() as Promise<{ client_id: string }>);
  const verifier = NodeCrypto.randomBytes(32).toString("base64url");
  const resource = `${base}/mcp`;
  const decided = await fetch(`${base}/oauth/mcp/decision`, {
    method: "POST",
    headers: json,
    body: JSON.stringify({
      authorization: {
        response_type: "code",
        client_id: registered.client_id,
        redirect_uri: redirect,
        code_challenge: NodeCrypto.createHash("sha256").update(verifier).digest("base64url"),
        code_challenge_method: "S256",
        scope: "orchestration:read orchestration:operate",
        state: "sample",
        resource,
      },
      decision: { _tag: "pairing-code", access: "full-access", code: pairing().credential },
    }),
  }).then((response) => response.json() as Promise<{ redirectTo: string }>);
  const code = new URL(decided.redirectTo).searchParams.get("code") ?? "";
  const token = await fetch(`${base}/oauth/mcp/token`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: redirect,
      client_id: registered.client_id,
      code_verifier: verifier,
      resource,
    }),
  }).then((response) => response.json() as Promise<{ access_token: string }>);
  const headers: Record<string, string> = {
    ...json,
    authorization: `Bearer ${token.access_token}`,
    accept: "application/json, text/event-stream",
  };
  const post = async (message: object) => {
    const response = await fetch(resource, {
      method: "POST",
      headers,
      body: JSON.stringify({ jsonrpc: "2.0", ...message }),
    });
    const session = response.headers.get("mcp-session-id");
    if (session) headers["mcp-session-id"] = session;
    return { status: response.status, body: await response.text() };
  };
  return post;
}

const opens = (url: string, headers: Record<string, string>) =>
  new Promise<string>((resolve) => {
    const socket = new WebSocket(url, { headers });
    socket.once("open", () => {
      socket.close();
      resolve("open");
    });
    socket.once("unexpected-response", (_request, answer) => {
      socket.terminate();
      resolve(`refused ${answer.statusCode}`);
    });
    socket.once("error", () => resolve("error"));
  });

describe("agents and access", () => {
  const proof = routes();
  afterAll(proof.close);

  it("stores no byline on an agent's t3_thread_send", async () => {
    const target = await proof.launch(proof.alice);
    const sender = await proof.launch(
      proof.alice,
      `Use the t3_thread_send tool to send exactly the text PING-FROM-AGENT to thread ${target}. Then reply with: done`,
    );
    const found = await until(async () => {
      const messages = await proof.userMessages(target);
      return messages.find((message) => message.text.includes("PING-FROM-AGENT"));
    }, "the agent's message");
    expect(found.text).not.toContain("Sent by");
    expect(found.createdBy).toBe("agent");
    expect((await proof.userMessages(sender))[0]?.text).toContain(byline("Alice"));
    await proof.settled(sender);
    await proof.settled(target);
  });

  it("stores no byline from an outside agent on a person's /mcp, and names the hostname in OAuth", async () => {
    const base = urls.alice;
    const metadata = await fetch(`${base}/.well-known/oauth-authorization-server`).then(
      (response) => response.json() as Promise<{ issuer: string }>,
    );
    expect(metadata.issuer).toBe(base);

    const target = await proof.launch(proof.alice);
    const post = await outsideAgent(base);
    const init = await post({
      id: 1,
      method: "initialize",
      params: {
        protocolVersion: "2025-06-18",
        capabilities: {},
        clientInfo: { name: "sample", version: "0" },
      },
    });
    expect(init.status).toBe(200);
    await post({ method: "notifications/initialized" });
    const sent = await post({
      id: 2,
      method: "tools/call",
      params: {
        name: "t3_thread_send",
        arguments: { threadId: target, message: "PING-FROM-OUTSIDE-AGENT" },
      },
    });
    expect(sent.status).toBe(200);
    const found = await until(async () => {
      const messages = await proof.userMessages(target);
      return messages.find((message) => message.text.includes("PING-FROM-OUTSIDE-AGENT"));
    }, "the outside agent's message");
    expect(found.text).toBe("PING-FROM-OUTSIDE-AGENT");
    expect(found.createdBy).toBe("agent");
    await proof.settled(target);
  });

  it("makes a cookie session on a person's hostname, and the server refuses another origin", async () => {
    const base = urls.alice;
    const session = await fetch(`${base}/api/auth/browser-session`, {
      method: "POST",
      headers: { ...json, origin: base },
      body: JSON.stringify({ credential: pairing().credential }),
    });
    expect(session.status).toBe(200);
    const cookie = session.headers.getSetCookie()[0]!.split(";")[0]!;
    const socket = `${base.replace("https:", "wss:")}${PROTOCOL}`;
    expect(await opens(socket, { cookie, origin: base })).toBe("open");
    expect(await opens(socket, { cookie, origin: urls.sam })).toMatch(/^refused 40/u);
    expect(await opens(socket, { origin: base })).toMatch(/^refused 40/u);
  });
});
