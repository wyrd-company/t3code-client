---
t3c-docs: patch
t3code-cli: minor
---

Target stock T3 Code 0.1.13 and use `t3c usage summary --provisional` for budget polls that can use a potentially stale scan. Check the source refresh markers before acting on it. The flag conflicts with `--await-refresh`. Omitting both uses the server default.
