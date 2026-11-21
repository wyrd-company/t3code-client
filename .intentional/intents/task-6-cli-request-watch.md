---
t3c-docs: patch
t3code-cli: minor
---

Watch approvals and questions the client sees pending with `t3c requests watch` and an `orchestration:read` credential. Filter by project, request kind, exact thread id and tag. Each selected request is reported once per run as a JSON line. Optional `--exec` hooks receive the line on stdin and run with bounded concurrency and a timeout. Hook output and failures go to stderr while the watch continues. Answer requests explicitly with `t3c thread respond`.
