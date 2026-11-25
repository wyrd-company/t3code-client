---
product: t3c
title: Sessions, scopes and errors
order: 42
relationships:
  references: [library, api]
---

# Sessions, scopes and errors

Bind a session to a key, read the grant and handle failures.

## Proof-bound sessions

A session bound to a DPoP key is useless to someone who holds only its token.
The credential store keeps the key with the token, and every request and socket
upgrade then carries a proof:

```ts
import { T3Client, fileCredentialStore, generateDpopKey } from "@wyrd-company/t3code-lib";

const client = T3Client.create({
  baseUrl,
  credentials: fileCredentialStore(credentialPath),
});
await client.auth.exchangePairingToken(pairingToken, { dpopKey: generateDpopKey() });
```

A program that starts the server in desktop mode exchanges the token that derives
from its bootstrap secret with `currentDesktopBootstrapToken(secret)`.

## Scopes

The server grants granular permissions (`orchestration:read`,
`orchestration:operate`, `filesystem:read`, `filesystem:write`,
`source-control:write`, `terminal:read`, `terminal:operate`, and more) and
reports them in `permissions`; `scopes` carries only the vocabulary older
clients knew. `grantedScopes(state)` reads the grant from whichever is present.
The client checks registered RPC scopes when it knows the session's grant.
A scope missing from that grant fails locally with `insufficient_scope`.
The server checks the extra scopes T3 Code 0.1.12 adds for
[creating guest shares](guide-remote-access.md#guests-and-webhooks),
[writing project scripts and answering secret requests with references](guide-server-calls.md#settings),
and [setting a cloud speech key from a secret reference](guide-server-calls.md#voice).

## Errors

Every failure is a `T3Error` with a stable `code`:

| Class                 | `code`                               | When                                               |
| --------------------- | ------------------------------------ | -------------------------------------------------- |
| `T3AuthError`         | `auth_invalid`, `insufficient_scope` | 401 or 403, or a scope check before sending        |
| `T3NotFoundError`     | `not_found`                          | 404                                                |
| `T3HttpError`         | `http`                               | any other non-2xx                                  |
| `T3RpcError`          | `rpc_failed`                         | the server answered an RPC with a tagged error     |
| `T3RpcDefectError`    | `rpc_defect`                         | the server died handling an RPC                    |
| `T3StorageError`      | `storage`                            | profile config or credential backend I/O           |
| `T3ConnectionError`   | `connection`                         | socket open failed, closed, ping timeout, protocol |
| `T3DecodeError`       | `decode`                             | a server payload did not match the schema          |
| `T3PreconditionError` | `precondition`                       | invalid input caught before sending                |
| `T3InterruptedError`  | `interrupted`                        | a call or stream was cancelled                     |

`T3HttpError.retryAfter` is the raw `Retry-After` header when the server
sends one. It holds seconds as a string or an HTTP date, and is `undefined`
when the header is absent. A starting T3 Code 0.1.12 server sends it with
503, and a rate-limited workflow hook sends it with 429.
