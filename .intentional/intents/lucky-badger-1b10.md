---
t3c-docs: patch
t3code-cli: patch
t3code-lib: minor
t3code-mcp: patch
t3mcp-docs: patch
---

Add the settings methods `server.updateSettings`, `server.upsertKeybinding`, `server.removeKeybinding`, `server.updateProvider`, `server.reportClientActivity`, `server.discoverSourceControl`, `server.refreshUsageRates` and `secrets.answerRequest`. A settings patch is validated key by key and asks for the scope the server requires. `RpcErrorRecord` decodes `ServerProviderUpdateError` and `SecretRequestError`, and `ServerSettingsError` no longer needs a `cause`. `schemas.settingsPatch`, `schemas.providerInstance`, `schemas.deviceHosts`, `schemas.serverActions` and `schemas.sourceControl` hold the new types.
