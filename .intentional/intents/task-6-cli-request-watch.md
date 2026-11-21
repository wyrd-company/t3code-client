---
t3c-docs: patch
t3code-cli: minor
---

Watch approvals and questions the client sees pending with `t3c requests watch` and an `orchestration:read` credential. Select requests by project with `--project` and kind with `--kind`. Exclude threads by exact ID with `--exclude-thread` or by tag with `--exclude-tag`. Reporting excludes requests already pending in archived threads at startup. Each selected request is reported once per run as a JSON line. Optional `--exec` hooks receive the line on stdin and run with bounded concurrency and a timeout. Hook output and failures go to stderr while the watch continues. Answer requests explicitly with `t3c thread respond`.
