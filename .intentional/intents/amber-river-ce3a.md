---
t3code-lib: major
---

The peer-link access check adds a refinement to `schemas.auth.AuthCreatePairingCredentialInput`. Use `.safeExtend()` to extend the schema while preserving that check. Build derived schemas from `.shape` when migrating uses of `.pick()`, `.omit()`, or `.partial()`, which now throw on this schema.
