---
relationships:
  references:
    - command-line
    - library
    - testing
    - releasing
---

# t3code-client workspace

Read `docs/technical-designs/library.yml` before changing library code. It is
the library contract. Package guidance is in `packages/t3code-lib/AGENTS.md`.
Read `docs/technical-designs/testing.yml` and `docs/technical-designs/releasing.yml` before changing automation.

## Layout

- `packages/t3code-lib`: npm `@wyrd-company/t3code-lib`, release unit `t3code-lib`.
- `packages/t3code-cli`: npm `@wyrd-company/t3code-cli`, unit `t3code-cli`, binary
  `t3c`. Shared composition and handler ownership are in `docs/technical-designs/composition.yml`.
- `scripts/release`: shared unit-aware pack, validation and publication steps.
- `.intentional`: independent unit projections and one pre-0.1.0 intent per unit.
- `docs/user`: the published wyrd.foo docs, in the v2 format. Release unit
  `t3c-docs` (tag-only) versions them; `docs/user/docs.yml` versions are hand-set.

## Conventions

Node >=22.16, pnpm 11, vite-plus 0.3.3 and TypeScript 7. ESM/NodeNext,
`.ts` relative imports, `erasableSyntaxOnly`, camelCase files, colocated
`vite-plus/test` tests, no `any`, files about 300 lines or less.
Use generic example/test values. Follow Conventional Commits.
Application code must not spawn CLIs. The CLI composes the library and does
not implement wire protocol. Only build/test tools may spawn the test server.
CLI command behavior is defined by `docs/specifications/command-line.yml`; canonical
architecture is in `docs/technical-designs/`.
The pinned `t3` devDependency is 0.1.0; runtime code must not enforce a pinned
server version. Preserve protocol 2 and the supported upstream capabilities.

Use `intentional add` for consumer changes; maintain the package's single
pre-0.1.0 intent. Never hand-edit released versions or changelogs. Historical
`t3code-client@*` tags and root CHANGELOG.md belong to the retired package.
No authoritative baseline tags before epic finalization. `task check` uses a
scratch repository for missing pre-release baselines, without tagging this repo.

Run `task check` before handoff. Root verbs cover the workspace; `lib:*` and
`cli:*` select a package. Registered commands without handlers explicitly fail.
