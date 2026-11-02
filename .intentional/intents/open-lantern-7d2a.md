---
t3c-docs: patch
t3code-cli: patch
t3code-lib: minor
t3code-mcp: patch
t3mcp-docs: patch
---

Add `client.guestShares` with `create`, `close`, `sendMessage` and `dismissMessage`. Thread records expose `guestShare`, shell rows expose `pendingGuestMessageCount`, message context exposes `guest`, thread events include `thread.guest-share-updated`, commands include `thread.guest-share.close` and `thread.guest-message.dismiss`, `message.dispatch` takes `guestMessageId`, and `RpcErrorRecord` includes `GuestShareCreateError`.
