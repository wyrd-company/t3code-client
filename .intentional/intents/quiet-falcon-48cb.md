---
t3c-docs: patch
t3code-cli: patch
t3code-lib: minor
t3code-mcp: patch
t3mcp-docs: patch
---

Type the server field changes of T3 Code 0.1.6. Environment capabilities expose `sideChats`, `threadForceStop`, `localServerStop` and `desktopAppChannelSwitch`, and the descriptor exposes `databaseMigration`. The server configuration exposes `secretProviderSettings`, `secretReferences`, and the source and variable of each OTLP endpoint. Terminal snapshots and activity events expose `cols` and `rows`, pull request watches expose `owedChecks` and `checksAwaitedSince`, and message context has an `environment` record. `GitCommandError` has the `config_locked` reason, and usage has the `muse` provider. `reasoningMessages` and `requiresNewThreadForModelChange` are removed, because the 0.1.6 server no longer sends them.
