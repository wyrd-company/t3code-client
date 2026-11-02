---
t3c-docs: patch
t3code-cli: patch
t3code-lib: minor
t3code-mcp: patch
t3mcp-docs: patch
---

Target stock T3 Code 0.1.6. Follow methods the server removed: `server.getSettings()` reads the settings from the server configuration and `scheduledTasks.list()` reads the first item of the task subscription, with the same results. `ShellApi.watchArchived`, `TerminalApi.watchEvents`, `AuthClient.listPairingLinks` and `AuthClient.listClients` are removed because the server no longer serves them: read archived threads with `archivedSnapshot`, and read pairing links and client sessions from the first `watchAccess` snapshot.
