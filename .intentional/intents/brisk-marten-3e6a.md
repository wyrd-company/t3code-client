---
t3c-docs: patch
t3code-cli: patch
t3code-lib: minor
t3code-mcp: patch
t3mcp-docs: patch
---

Add the provider install methods `provider.install.start`, `provider.install.cancel`, `provider.install.subscribe` and `provider.install.remove`, and the ACP registry methods `server.searchAcpRegistry`, `server.prepareAcpRegistryAgent`, `server.uninstallAcpRegistryManagedBinary`, `server.acceptAcpRegistryUrlAuth`, `server.listAcpRegistrySessions`, `server.importAcpRegistrySession`, `server.deleteAcpRegistrySession`, `server.listAcpRegistryProviders`, `server.setAcpRegistryProvider`, `server.disableAcpRegistryProvider` and `server.logoutAcpRegistry`. `schemas.providerInstall` and `schemas.acpRegistry` hold the new types, and `AcpRegistryOperationError` joins the RPC error record. `redactSecrets` also removes a whole `headers` map.
