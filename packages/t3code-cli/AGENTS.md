---
relationships:
  references:
    - command-line
    - composition
    - testing
    - releasing
---

# t3code-cli

`t3c` is the Node command-line consumer of `@wyrd-company/t3code-lib`.
Read [the specification](../../docs/specifications/command-line.yml) and
[the design](../../docs/technical-designs/cli-architecture.yml) before changing command behavior. Read
[workspace testing](../../docs/technical-designs/testing.yml) and
[workspace releases](../../docs/technical-designs/releasing.yml) before changing automation.

## Boundaries

- Package: `@wyrd-company/t3code-cli`; binary: `t3c`; release unit: `t3code-cli`.
- Node >=22.16, commander, ESM/NodeNext, TypeScript 7, vite-plus 0.3.3, pnpm 11.
- Compose library facades, `ProfileManager`, and `T3Error` subclasses. The library
  owns HTTP, WebSocket RPC, profiles, credential exchange and storage.
- Application code uses native library APIs. Build and test tools own server processes.
- Target stock T3 Code 0.1.0 and orchestration protocol 2. Version reporting is
  informational; runtime code accepts compatible servers without pinned checks.
- Pass a supplied runtime mode through. Preserve the server's mode when omitted.
- Keep assistant output on stdout and progress, thread identity, warnings and the
  short final error on stderr. Preserve structured output and exit codes.
- Interactive prompts require a TTY. User-input questions require explicit answers.
- Preserve every supported command and policy in the specification. Route unsettled
  security, auth, capability and timeout choices through the epic adjudicator.

## Conventions and verification

- Use camelCase files, `.ts` relative imports, erasable TypeScript, `unknown`
  narrowed at boundaries, and colocated `vite-plus/test` tests. Files stay about
  300 lines or less. Node namespace imports use the library's canonical aliases.
- Use generic, non-identifying examples and test values.
- Use library errors for library failures and a single CLI mapping for exit codes.
- Run `task check` before handoff. Root verbs cover both packages; `cli:*` selects
  this package. Reserved verbs do not prove a working command.
- Real command checks use the pinned server with a fresh task-specific home outside
  Git and `gpt-6-luna` subjects. Clear inherited operational live overrides before
  isolated acceptance; clean only owned processes and homes.
- Use Conventional Commits and `intentional add`. Maintain one consolidated minor
  intent per new unit; manifests stay `0.0.0` until epic finalization. Intentional
  owns versions and changelogs. Each unit releases independently with provenance.
- The CLI package contains `dist/cli.js` and a registry-resolved `npm-shrinkwrap.json`.
  Local consumer checks install the library and CLI tarballs together.

The [Dagu harness guide](../../docs/dagu.md) explains stdin, output and continuation; the specification defines CLI behavior.
