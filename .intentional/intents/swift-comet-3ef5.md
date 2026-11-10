---
t3c-docs: patch
t3code-lib: minor
t3code-mcp: minor
t3mcp-docs: patch
---

Add read-only server diagnostics. The library adds `client.diagnostics` (`DiagnosticsApi`) with `traces`, `processes`, `hostResources`, `resourceHistory` and `storageCleanupReport` (the first report stream item, `null` before the first cleanup). `t3code-mcp` adds `server_traces`, `server_processes`, `server_host_resources`, `server_resource_history` and `server_storage_cleanup_report`. Process lists, the history window and each command line, failure cause and log message are bounded, and Effect `Option` fields are returned as their value or null. No tool signals a process, runs a cleanup or restarts the resource monitor.
