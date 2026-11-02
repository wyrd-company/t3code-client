---
t3c-docs: patch
t3code-cli: patch
t3code-lib: minor
t3code-mcp: patch
t3mcp-docs: patch
---

Add `client.routes`, a typed entry for each HTTP route by name, with `POST /api/auth/browser-session`, `POST /api/auth/websocket-ticket/:use`, `POST /api/projects/mutate` and `GET /api/orchestration/threads/:threadId/bounded`. `exchangePairingToken` and `setAccessToken` accept `dpopKey` for a session bound to a DPoP key: `generateDpopKey` makes the key, the credential store keeps it with the token, and every request and socket upgrade carries a proof. `currentDesktopBootstrapToken` derives the token of a desktop bootstrap secret. `T3ClientOptions.fetchAuthenticates` lets a `fetch` with a cookie jar carry a browser session. `ThreadHistoryPageOptions.view` accepts `work`.
