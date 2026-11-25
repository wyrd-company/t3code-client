---
t3code-lib: major
---

When upgrading the server to stock 0.1.12, update scoped credentials for the operations you use. `guestShare.create` needs `orchestration:read` in addition to `access:write`. Reference answers to `secrets.answerRequest` and reference-backed cloud speech keys need `providers:manage`. `server.updateSettings` patches that write project scripts need `orchestration:operate`. The server checks these added scopes.
