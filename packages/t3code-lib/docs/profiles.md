---
relationships:
  implements: design
  references: [api, credentialStore, authClient, profileManager, profileConfig]
---

# Shared server profiles

`ProfileManager` stores named servers for command-line and MCP consumers.
`TARGET_T3_CODE_VERSION` reports the server release targeted by the library
(`0.1.0`), independently of the library's own package version. It is descriptive;
runtime operations do not require an exact server version.

## Configuration

The default config is `$XDG_CONFIG_HOME/t3c/config.json`, or
`~/.config/t3c/config.json` when XDG_CONFIG_HOME is absent or relative.
`T3C_CONFIG_HOME` selects the t3c directory directly. An explicit constructor
`configDir` overrides both environment locations.

```json
{
  "servers": {
    "sample": { "url": "https://server.example" },
    "secondary": { "url": "https://other.example" }
  },
  "current": "sample"
}
```

The config has no credentials. Config writes use a temporary file and rename,
with mode 0644. Each profile has a separate mode-0600 JSON credential file in
`credentials/`. The filename is the SHA-256 digest of the complete profile name
plus `.json`, so names cannot become paths. Both config and credential files
are replaced atomically. These are individual file operations, not a transaction
across the credential backend and config. Concurrent config writers must be
serialized by the caller.

Missing config means no profiles. Invalid JSON, an invalid config shape, an
invalid server URL, or a current name absent from `servers` raises
`T3PreconditionError` (`code: "precondition"`). File access and config writes
raise `T3ConnectionError` (`code: "connection"`, `reason: "open_failed"`).
Config errors do not include config contents. Invalid credential JSON or schema
raises `T3DecodeError` (`code: "decode"`); credential-shaped values are redacted,
and malformed JSON is withheld entirely. Missing credential files load as an
empty credential. Config/store failures propagate to the caller; they do not
silently select another profile or backend.

## Resolution

`resolve({server, credentialsFile, env})` returns connection options for
`T3Client.create`. `env` defaults to `process.env`. It resolves the server in
this order: explicit `server`, `T3_SERVER_URL`, then the current profile.
It resolves credentials in this order: explicit `credentialsFile`, `T3_TOKEN`,
then the selected profile's store. `T3_TOKEN` alone uses the current server.
Overrides never update saved profiles or their credentials.

Profile URLs are normalized to their HTTP or HTTPS origin before storage and
matching: lowercase scheme and host, no default port or trailing slash, and no
path, query or fragment. URL user information is not stored. An explicit server
URL matches stored profiles using that normalized origin. The first matching profile
supplies stored credentials. An unmatched server uses an empty in-memory store
unless credentials are overridden. It never inherits credentials from a
different server. A caller can supply both a server URL and a credential source
without creating a profile. With no selected server, resolution raises
`T3PreconditionError`.

Resolution returns `sources.server` (`flag`, `environment`, `profile`) and
`sources.credentials` (`file`, `environment`, `profile`, `none`) so a consumer
can report selection without showing tokens. Resolving and listing profiles do
not load credential contents. Blank flag values remain explicit inputs; they
do not fall back to environment values.

```ts
import { ProfileManager, T3Client } from "@wyrd-company/t3code-lib";

const profiles = new ProfileManager();
const connection = await profiles.resolve();
const client = T3Client.create(connection);
try {
  const projects = await client.projects.list();
  console.log(projects.map((project) => project.title));
} finally {
  await client.close();
}
```

## Register, select and remove

`pair({name, url}, pairingToken, options?)` exchanges an upstream pairing token
through `AuthClient`. `setAccessToken({name, url}, token)` validates an issued
session token through `AuthClient`. Only successful authentication and credential
storage register the profile. The first successful registration selects current;
further registrations preserve it. Authentication failures leave config unchanged.
Token issuance remains upstream; this module does not implement browser OAuth.

`resolveProfile(name)` returns the exact named profile's connection inputs without
flag or environment overrides. This lets status consumers probe each configured
credential, including multiple names that share a URL, without changing current.
It reports both sources as `profile` and raises `T3NotFoundError`
(`code: "not_found"`, `reason: "profile_not_found"`) for an unknown name.
Unknown names supplied to `switch` or `logout` remain `T3PreconditionError`.

`list()` returns names and URLs. `getCurrent()` returns the current profile or
undefined. `switch(name)` requires an existing profile. `logout(name?)` clears
the selected profile's local credential through `AuthClient` and removes its
config entry. Without a name it uses current. Removing current clears current
without selecting another server. Logout does not revoke the upstream session.

```ts
import { ProfileManager } from "@wyrd-company/t3code-lib";

const profiles = new ProfileManager();
// Read the one-time credential from the caller's input channel.
await profiles.pair({ name: "sample", url: "https://server.example" }, pairingToken);
await profiles.setAccessToken(
  { name: "secondary", url: "https://other.example" },
  issuedSessionToken,
);
await profiles.switch("secondary");
await profiles.logout("sample");
```

## Credential backend seam

`CredentialSource` receives a profile and its default file path, then returns
an existing `CredentialStore` synchronously or asynchronously. The default calls
`fileCredentialStore(path)`. A future Vault/OpenBao or keyring integration can
supply this factory without changing profile resolution. No such client ships
with the library. Store implementations follow the library's typed-error
contract: `load`, `save` and `clear` reject with `T3Error` subclasses.

```ts
import { ProfileManager, type CredentialSource } from "@wyrd-company/t3code-lib";

const credentialSource: CredentialSource = (profile) => stores.forServer(profile.url);
const profiles = new ProfileManager({ credentialSource });
const connection = await profiles.resolve();
```

Only `AuthClient` reads, writes or clears the selected store. `ProfileManager`
selects it and composes a client for registration or logout. Explicit
`T3Client.create({credentials})` and `T3Client.create({accessToken})` retain their
existing behavior; the direct client defaults to in-memory storage. An explicit
credential-file override uses that file even when a custom profile backend is
configured.

Generate the [public API reference](api.md) with `task lib:docs` and verify it
with `task lib:docs:check`. The generator uses `jsdoc-to-markdown` on compiled
JavaScript and adds signatures from the public TypeScript source. The
`typescript-api` development alias supplies the 5.9 compiler API for documentation;
the build and typecheck toolchain remains TypeScript 7.
