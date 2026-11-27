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

`connect.linkProof` accepts loopback origins, and `connect.relayConfig` requires an HTTPS relay.
Both routes require `relay:configure` on T3 Code 0.1.11 and later. On 0.1.10, both require `relay:write`
and the proof is tied to the server's own loopback origin. Link state and reachability require
`relay:read`. Unlinking and preference updates require `relay:write`.

`connect.health` and `connect.mintCredential` accept a single-use proof. The relay signs it
with the key supplied when configuring the relay.

## Guests and webhooks

`guest.*` are the routes of a person or program that has a share's link from
`guestShares.create`. On T3 Code 0.1.12, creating the share requires `access:write`
and `orchestration:read`. The guest routes send no session token. `guest.redeem` answers with a cookie for
that share, so give the client a `fetch` that keeps it, as for `auth.browserSession`. The
credential is the link's fragment. `schemas.orchestrationGuestShare` and
`schemas.orchestrationGuestStream` hold their shapes.

```ts
import { T3Client, schemas } from "@wyrd-company/t3code-lib";

const guest = T3Client.create({ baseUrl, fetch: fetchWithCookieJar });
const shareId = schemas.common.GuestShareId.parse(rawShareId);
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

The `webhooks.webhookPost`, `webhookPut`, `webhookPatch` and `webhookGet` routes accept
paths from `client.scheduledTasks.webhookEndpoint(taskId)` or, for a durable workflow,
from `t3 workflow hooks --json` on the server host. For workflows, use the POST
route and follow the run in [Durable workflows](guide-threads.md#durable-workflows).
The path holds the token, and the routes send no session token. Send the body as
raw bytes and include the signature header if the scheduled task requires one.

```ts
import { webhookUrlParams } from "@wyrd-company/t3code-lib";

const accepted = await client.routes.call("webhooks.webhookPost", {
  params: webhookUrlParams(hookPath),
  headers: { "content-type": "application/json", ...signatureHeaders },
  body: new TextEncoder().encode(JSON.stringify({ action: "sample" })),
});
if (typeof accepted.deliveryId === "string") {
  const deliveryId: string = accepted.deliveryId;
  console.log("Scheduled task delivery", deliveryId);
} else if (typeof accepted.runId === "string") {
  const runId: string = accepted.runId;
  console.log("Workflow run", runId);
}
```

Pass the endpoint's `path` as `hookPath`. Use an empty `signatureHeaders` object
when the hook has no signature requirement. A scheduled-task hook returns
`{ deliveryId }` for the delivery record, and a workflow hook returns `{ runId }`.
Both response schemas allow extra fields, so check the field's type before using it.

For a `T3HttpError`, use `schemas.workflow.WebhookFailure.safeParse(error.body)`
to read the failure's `error` and optional `problem`. A workflow hook's 400 can
include an input validation problem. A 429 carries `T3HttpError.retryAfter` with
the server's suggested wait.

## Linked environments

Use `client.rpc.call("peerLinks.names", {})` to read linked environment IDs and
labels with `orchestration:read`. With an `environmentId` and `threadId`,
`peerLinks.subscribeThread` yields the same items as the local thread stream.
Use `client.rpc.stream` for the subscription and `client.rpc.call` for
`peerLinks.threadHistoryPage` with the snapshot's `historyCursor` as `cursor`,
or `peerLinks.threadItem` with an `itemId`. All three use `orchestration:read`.

`peerLinks.pairClient` takes `{ environmentId }` to ask the peer for a client
pairing credential. `peerLinks.pairLink` takes `{ environmentId, access }` to get
a credential for linking another environment to that peer. Both need
`access:write`. For `pairLink`, also hold the scopes in
`mcpClientScopes(access)`. A `credential` result includes the peer's `urls` and
the one-time credential with its `expiresAt`. Use it with
`auth.exchangePairingToken` on a client pointed at the peer, or with
`peerLinks.link` on the environment making the link. An `unsupported` result
gives the reason, such as `link_access` or `version`.

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
takes a credential from `auth.createPairingCredential` with the scopes of the access. A server
with the `mcpApprovalCodes` capability also takes an approval code: create the credential with
`access` in place of `scopes`. The code, such as `AUTO-…`, approves one sign-in, and the decision
must name that level; another level is refused with HTTP 400. The result's `access` repeats the
level. A
`browser-session` decision takes the `csrfToken` from `mcpOAuth.approval`. Both routes send the
client's access token when it has one, and the server approves for a session with `access:write`
and `orchestration:read`. A client that approves with a browser session's cookie instead needs a
`fetch` that keeps the cookie, as for `auth.browserSession`. The answer's `redirectTo` holds a
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

To revoke the token, call `mcpOAuth.revoke` with
`{ body: { token: token.access_token } }`. The route returns an empty 200
for a revoked, unknown or already revoked token.
