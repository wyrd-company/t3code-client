---
relationships:
  references:
    - testing
    - design
---

# Releasing

[Intentional](https://github.com/wyrd-company/intentional) owns versions,
changelogs, intents and annotated release records. The root package is private.
The independent units are:

| Unit         | Manifest                           | npm name                   | Record             |
| ------------ | ---------------------------------- | -------------------------- | ------------------ |
| `t3code-lib` | `packages/t3code-lib/package.json` | `@wyrd-company/t3code-lib` | `t3code-lib@X.Y.Z` |
| `t3code-cli` | `packages/t3code-cli/package.json` | `@wyrd-company/t3code-cli` | `t3code-cli@X.Y.Z` |

The root CHANGELOG.md and `t3code-client@*` tags are historical records for the
retired package. Keep them intact. Bob owns deprecation of the old npm name.

## Intents

Each package has exactly one minor intent before its initial 0.1.0 release.
Update that intent's message with the package's complete outcome rather than
adding an intent for each implementation task. Author it through Intentional:

```bash
intentional add --release-unit t3code-lib:minor --message "Describe the library outcome."
intentional add --release-unit t3code-cli:minor --message "Describe the CLI outcome."
```

For later releases, an intent accompanies each consumer-visible change.
Before 1.0.0, bump names map directly onto version components: `minor` for a
new capability or breaking change and `patch` for a fix.

## Baseline and first release

Manifests start at 0.0.0. No authoritative tags are made on an epic branch.
`task intents` and CI use a disposable clone, overlay the current configuration
and manifests, and create local-only baselines for missing zero-version units.
These clones never push. The working repository's tags remain intact.

Only at epic finalization, after Bob's UAT and default-branch merge, establish
authority on the merged main commit:

```bash
intentional tag --baseline --dry-run
intentional tag --baseline
git push --atomic origin refs/tags/t3code-lib@0.0.0 refs/tags/t3code-cli@0.0.0
intentional status
intentional check
intentional plan > release-plan.json
```

Each minor intent computes 0.1.0. Baseline records do not start publication.
The CLI scaffold removes `private` and supplies its executable, build, tests,
license, README and npm shrinkwrap before finalization. Private placeholders
cannot be packed or released. First publication is pre-approved only at that
finalization boundary.

## Cutting a release

On up-to-date main, inspect `intentional status` and `intentional plan`.
Run `task check`, then dispatch **Release** with the exact expected record set:

```bash
gh workflow run release.yml --ref main \
  -f 'expected-records=t3code-lib@0.1.0 t3code-cli@0.1.0'
```

Intentional applies the whole pending plan. It has no per-unit apply switch.
Release compares the entire planned record set against the expected set and
fails on any difference. To release only one unit, only that unit may be pending;
name only its record. No unrelated unit is bumped implicitly. Versions are
independent even when a single dispatch releases both.

Release checks main, validates intents, runs the checks, saves the canonical
plan and verifies the exact record set and public package identities. It
recomputes and compares the plan immediately before apply. After apply it updates
the pnpm lockfile, checks formatting, commits the projections and consumed
intents, and creates records from the saved plan. The commit and selected records
are pushed atomically. App credentials start the downstream Publish workflows.
A concurrent main update makes the push fail; nothing is force-pushed.

## Publication

**Publish** responds to either unit's annotated record. It verifies the record
identity, version, annotation, checked-out head and main ancestry. It checks
and packs only the selected unit. A library tarball contains compiled JavaScript
and declarations, LICENSE and README, with no source or tests. The consumer gate
checks runtime imports and TypeScript NodeNext and Bundler resolution using
TypeScript 5.9. Public imports are the package root and `./package.json`.

The CLI tarball contains `dist/cli.js` and `npm-shrinkwrap.json`. The shrinkwrap
must match the package identity/version and contain registry resolutions, with
no workspace, file or link dependencies. The scaffold owns shrinkwrap production
from the built CLI and its resolved library dependency; `pnpm pack` must include
it. CLI consumer verification installs the local library and CLI tarballs together
and runs `t3c --version`, so it does not depend on first-publication ordering.
The release-plumbing task verifies the final shrinkwrap and Homebrew handoff.

The package upload/download artifact is named `package-${github.ref_name}`;
all jobs consume that same artifact. Publish checks tarball identity again,
publishes with npm provenance, and creates the GitHub Release with the same
tarball and the package's changelog section. A rerun verifies an existing npm
integrity value and GitHub asset bytes instead of replacing them.

## Tracking T3 Code

The library pins the `t3` devDependency. Main targets the newest release;
a preparation branch targets the newest nightly. Upstream release tags are
`vX.Y.Z`; nightly tags are `vX.Y.Z-nightly.YYYYMMDD.N`.

1. Read `npm view t3 dist-tags`, update the library's devDependency and install.
   Keep only the target build's `minimumReleaseAgeExclude` entries in the root
   `pnpm-workspace.yaml`.
2. Compare upstream contracts (`packages/contracts/src`), server RPC handlers,
   auth scopes and HTTP routes between the two tags. Update library schemas
   and the typed registry. Methods outside the library design's scope stay
   reachable through `rpc.callRaw` and `rpc.streamRaw`.
3. Capture library fixtures again (see [testing](../packages/t3code-lib/docs/testing.md))
   and run `task lib:test:live`.
4. Update the build named in the library design and the package intent.

## Recovery and verification

- Release failed before its atomic push: fix main and dispatch again with the
  reviewed expected record set. No request tag needs deletion.
- Publish failed: rerun Publish for the same record. Existing artifacts must
  match; different bytes fail.
- Missing baseline at a nonzero version: stop and recover authoritative history.
  The ephemeral baseline check accepts only missing zero-version units.

`task release:test`, `actionlint` and `shellcheck -x scripts/release/*.sh` validate
local release boundaries. Actual main/tag events, npm provenance, GitHub assets
and registry installation remain finalization gates.

## Repository setup

| Secret                    | Used by | Purpose                                |
| ------------------------- | ------- | -------------------------------------- |
| `WYRD_CI_APP_ID`          | Release | GitHub App pushing commits and records |
| `WYRD_CI_APP_PRIVATE_KEY` | Release | App key                                |
| `NPM_TOKEN`               | Publish | npm automation token for both packages |

The App needs Contents write. Publish requires an Intentional release record
whose commit is on main. A tag ruleset allowing only the App to create
`t3code-lib@*` and `t3code-cli@*` records enforces that release authority.
