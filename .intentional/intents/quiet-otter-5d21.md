---
t3c-docs: patch
t3code-cli: patch
t3code-lib: minor
t3code-mcp: patch
t3mcp-docs: patch
---

Add the diagnostics methods `server.getTraceDiagnostics`, `server.getProcessDiagnostics`, `server.getHostResources`, `server.getProcessResourceHistory`, `server.getResourceTelemetryHistory`, `server.retryResourceTelemetry`, `server.checkOtlpEndpoint`, `server.signalProcess`, `server.runStorageCleanup`, `server.getStorageCleanupReport` and `subscribeResourceTelemetry`. `schemas.diagnostics`, `schemas.resourceTelemetry` and `schemas.storageCleanup` hold the new types.
