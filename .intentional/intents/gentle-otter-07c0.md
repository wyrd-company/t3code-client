---
t3c-docs: patch
t3code-lib: minor
---

Add `provider.auth.removeMethod`, `server.reclaimDatabaseSpace` and `server.listTextGeneratorModels`. Auth methods read `canRemove`, the database storage status reads `canReclaim` and `reclaimFailure`, and `DatabaseReclaimError` and `TextGeneratorError` decode. `server.refreshProviders` accepts `modelCatalogOnly` and `providerCatalogsOnDemand`, and `server.watchConfig` accepts `providerCatalogsOnDemand`. `schemas.textGenerator` holds the new types.
