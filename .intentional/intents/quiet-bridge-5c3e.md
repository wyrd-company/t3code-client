---
t3c-docs: patch
t3code-cli: patch
t3code-lib: minor
t3code-mcp: patch
t3mcp-docs: patch
---

Add `client.peerLinks` with `list`, `link`, `unlink` and `answerRequest`. Thread rows expose `linkOrigin` and `delegatedFrom`, turn items include `link_request`, environment capabilities expose `peerLinks`, `mcpModeLimitHeader` and `linkFence`, and `RpcErrorRecord` includes `PeerLinkError` and `PeerLinkRequestError`.
