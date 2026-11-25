---
t3code-lib: major
---

The `kind` field of `schemas.providerInstance.UsageLimitSourceConfig` now accepts `http` as well as `cliproxy`. Handle both kinds when reading settings. Schema consumers can use `UsageLimitSourceConfig.shape.kind.options` in place of the former literal's `.value`. The client advertises `httpUsageLimitSources` automatically. Read HTTP quota windows from `quotaAccounts` and account model lists from `models` when provided.
