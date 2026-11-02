---
t3c-docs: patch
t3code-cli: patch
t3code-lib: minor
t3code-mcp: patch
t3mcp-docs: patch
---

Add `server.getNpmRelease` and `server.prepareTriage`. `server.refreshProviders` accepts `reloadSecrets`, `workspaceSnapshotsOnDemand` and `usageLimitsCommand`, `server.watchConfig` accepts `usageLimitsCommand` and `workspaceSnapshotsOnDemand`, and `vcs.status` accepts `localOnly`. Environment capabilities expose `npmReleaseLookup`, `triage` and `providerWorkspaceSnapshotsOnDemand`.
