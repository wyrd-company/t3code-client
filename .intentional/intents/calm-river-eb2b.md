---
t3c-docs: patch
t3code-cli: patch
t3code-lib: minor
t3code-mcp: patch
t3mcp-docs: patch
---

Add `projects.createFromThread`, which turns a No project thread's own folder into a project in place. `projects.update` accepts `pinned` and `archived`, and projects carry `pinnedAt` and `archivedAt`. Environment capabilities expose `threadProjectFromScratch` and `projectOrganization`.
