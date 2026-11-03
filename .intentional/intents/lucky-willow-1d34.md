---
t3c-docs: patch
t3code-cli: patch
t3code-lib: minor
t3code-mcp: patch
t3mcp-docs: patch
---

Add the guest routes `guest.redeem`, `session`, `submit`, `stream`, `render`, `item`, `history`, `commandOutput`, `attachment` and `media`, and the webhook routes `webhooks.webhookPost`, `webhookPut`, `webhookPatch` and `webhookGet`. `HttpRouteClient.stream` reads a route that answers with server-sent events, and a route input can carry `headers`. `webhookUrlParams` reads the params of a webhook endpoint, and `schemas.orchestrationGuestStream` holds the shapes of a guest stream.
