---
t3c-docs: patch
t3code-cli: patch
t3code-lib: minor
t3code-mcp: patch
t3mcp-docs: patch
---

Add the provider sign-in methods `provider.auth.start`, `provider.auth.respond`, `provider.auth.complete`, `provider.auth.cancel`, `provider.auth.logout`, `provider.auth.subscribe`, `provider.chatgpt.reconnect-profile`, `provider.chatgpt.import-profile` and `provider.chatgpt.handoff.subscribe`, with `provider.consumeResetCredit` and `provider.uploadFeedback`. `schemas.providerSetup` holds the new types. `redactSecrets` also removes a device code and a URL whose query holds a code or an identity token.
