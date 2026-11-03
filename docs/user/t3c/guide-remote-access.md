---
product: t3c
title: Updates, T3 Connect, guests and MCP OAuth
order: 47
relationships:
  references: [library, api]
---

# Updates, T3 Connect, guests and MCP OAuth

Update a server, link it to a relay and use the routes that take no session.

## Server update and T3 Connect

`server.updateServer` asks a server to move to an exact version of `t3`, and
`server.updateServerWithProgress` reports its `downloading` and `installing` stages. Only a
server under a service launcher or a desktop app can do this. Another server refuses with a
`ServerSelfUpdateError`. `server.commitDesktopUpdate` lets a desktop host restart into an
update that its app downloaded. Each needs `environment:maintain`.

`cloud.getRelayClientStatus` reports the tunnel client that T3 Connect needs, and
`cloud.installRelayClient` downloads it into the server's home and reports each stage. A
failure is a `RelayClientInstallFailedError`, and its `reason` names the cause.

The `connect.*` routes read and change the server's link to a relay. `schemas.cloudLink`
holds their shapes, and `schemas.httpErrors.EnvironmentHttpCloudError` their failures:

```ts
const state = await client.routes.call("connect.linkState");
const reachability = await client.routes.call("connect.checkReachability");
await client.routes.call("connect.preferences", { body: { publishAgentActivity: true } });
```

`connect.linkProof`, `connect.relayConfig` and `connect.unlink` make and remove a link. A proof
is only for the server's own loopback origin, and `relayConfig` takes only an `https` relay.
`connect.health` and `connect.mintCredential` are what a relay calls. They take no session,
because the server checks the proof, which the relay signs with the key from `relayConfig`. A
proof works once. The reads need `relay:read`, and the writes `relay:write`.

## Guests and webhooks

`guest.*` are the routes of a person or program that has a share's link from
`guestShares.create`. They send no session token. `guest.redeem` answers with a cookie for
that share, so give the client a `fetch` that keeps it, as for `auth.browserSession`. The
credential is the link's fragment. `schemas.orchestrationGuestShare` and
`schemas.orchestrationGuestStream` hold their shapes.

```ts
const guest = T3Client.create({ baseUrl, fetch: fetchWithCookieJar });
const query = { share: shareId };
await guest.routes.call("guest.redeem", { body: { credential, name: "Sample guest" } });
await guest.routes.call("guest.submit", { query, body: { shareId, text: "Sample proposal." } });
for await (const event of guest.routes.stream("guest.stream", { query }, signal)) {
  if (event.kind === "item") console.log(event.value);
}
```

`routes.stream` reads a route that answers with server-sent events: `guest.stream` and
`guest.commandOutput`. An event that does not decode is a `decode-error` item, and the stream
continues. A guest's refusal is a `T3HttpError` whose `reason` names the cause, such as
`inactive` when the link is closed or `unavailable` when the thread does not show the item.

`webhooks.webhookPost`, `webhookPut`, `webhookPatch` and `webhookGet` call a webhook task's
endpoint. The path holds the token, so no error names it, and `webhookUrlParams` reads the
params from `scheduledTasks.webhookEndpoint`. The server reads the body as raw bytes:

```ts
const params = webhookUrlParams(endpoint.path);
const { deliveryId } = await client.routes.call("webhooks.webhookPost", {
  params,
  headers: { "content-type": "application/json", "x-sample-signature": signature },
  body: new TextEncoder().encode(JSON.stringify({ action: "sample" })),
});
```

## MCP OAuth

`mcpOAuth.*` are the routes of an MCP client that gets a token for the server's `/mcp` endpoint.
They send no session token. `schemas.authMcp` holds their shapes. The library does not make the
PKCE values and does not open a browser: the caller owns both.

```ts
const client = T3Client.create({ baseUrl });
const { client_id } = await client.routes.call("mcpOAuth.register", {
  body: { client_name: "Sample client", redirect_uris: [redirectUri] },
});
const authorization = {
  response_type: "code",
  client_id,
  redirect_uri: redirectUri,
  code_challenge: challenge,
  code_challenge_method: "S256",
  state,
};
const { location } = await client.routes.call("mcpOAuth.authorize", { query: authorization });
```

`mcpOAuth.authorize` does not follow its redirect. `location` is a relative address of the
server's approval page, or the client's `redirect_uri` with an `error`. A browser's `fetch` hides
a redirect, so there the route raises `T3PreconditionError`: send the browser to the URL instead.
A client or a redirect that the server does not know is a `T3HttpError` whose `body` is an HTML page.

`mcpOAuth.approval` and `mcpOAuth.decision` are what that page calls. A `pairing-code` decision
takes a credential from `auth.createPairingCredential` with the scopes of the access. A
`browser-session` decision takes the `csrfToken` from `mcpOAuth.approval`, and needs a `fetch`
that keeps the session's cookie, as for `auth.browserSession`. The answer's `redirectTo` holds a
one-use code that lasts one minute:

```ts
const { redirectTo } = await client.routes.call("mcpOAuth.decision", {
  body: { authorization, decision: { _tag: "pairing-code", access: "auto", code: credential } },
});
const token = await client.routes.call("mcpOAuth.token", {
  body: {
    grant_type: "authorization_code",
    code: new URL(redirectTo).searchParams.get("code") ?? "",
    redirect_uri: redirectUri,
    client_id,
    code_verifier: verifier,
  },
});
```

A refused `register` or `token` is a `T3HttpError` whose `reason` is the OAuth `error`, such as
`invalid_redirect_uri` or `invalid_grant`. A refused `approval` or `decision` has the `tag`
`AuthMcpApprovalError`.
