---
t3c-docs: patch
t3code-cli: minor
---

t3c server info prints readable, labelled lines by default: server, environment, platform, database and capabilities, then each provider with its auth status, its selectable models (slug, name, default) and their `--model-option` ids and choices (`*` marks the default). Text output omits account details. `--json` output is unchanged.
