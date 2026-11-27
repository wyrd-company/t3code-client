---
t3code-lib: major
---

When `server.updateSettings` moves a normalized destination on T3 Code 0.1.13, supply a new credential in the same patch. Otherwise the server clears a kept redacted value or unchanged secret reference. This affects OpenCode `serverUrl`/`serverPassword`, usage sources `url`/`managementKey`, text generators `baseUrl`/`apiKey` and Simlock `gatewayUrl`/`agentToken`. For Simlock, a change to the normalized path within the same origin can now clear the token.
