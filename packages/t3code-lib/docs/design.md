---
relationships:
  references:
    - library
    - library-wire
    - library-usage
    - library-transport
    - library-auth
    - library-facades
    - profiles
    - client
    - shell
    - socket
    - threadWatch
---

# t3code-lib technical design

The [library design](../../../technical-designs/library.yml) is the canonical
Refinery technical-design artifact. Its related designs define the
[wire protocol](../../../technical-designs/library-wire.yml),
[usage and client](../../../technical-designs/library-usage.yml),
[schemas and transports](../../../technical-designs/library-transport.yml),
[auth](../../../technical-designs/library-auth.yml) and
[facades](../../../technical-designs/library-facades.yml).

The [profile contract](profiles.md) defines `ProfileManager`, `CredentialSource`
and named-server resolution. The library exports `TARGET_T3_CODE_VERSION`.
