---
t3c-docs: patch
t3code-lib: minor
---

Add typed managed policy fields: `managedPolicy` on the server config (`schemas.managedPolicy` exports `ManagedPolicySummary` and its limits), `runtimeModeCeiling` on MCP approval details, and `blockedByPolicy` on scheduled tasks. `ServerSettingsError` gains the operations `write-managed-setting` and `use-disallowed-provider` with `managedSetting`, `managedBy` and `providerLabel`, `RelayClientInstallFailedError` gains the reason `managed_by_policy`, and `schemas.httpErrors.EnvironmentPairingCredentialError` types the failures of the pairing credential route, including the policy 403.
