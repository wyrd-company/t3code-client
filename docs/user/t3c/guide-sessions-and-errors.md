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
Every registered RPC method knows the scope it needs, so a missing one fails
locally with `insufficient_scope`.

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
