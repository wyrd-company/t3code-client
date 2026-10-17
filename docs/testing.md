---
relationships:
  references: testing
---

# Workspace testing

`task check` runs release-intent validation, workspace formatting/linting,
typechecks, unit tests, pinned-server live tests and local pack/consumer checks.
`task lib:check` runs library gates; `task cli:check` reports the reserved scaffold.
CLI placeholder checks pass but do not count as implementation evidence.

Library source, colocated tests, fixture data, fake server and live harness
are in `packages/t3code-lib`. See [library testing](../packages/t3code-lib/docs/testing.md)
for the full recipe and environment variables. Root `task fixtures` delegates
to that package. Every automatic live run gets a fresh temporary server home;
never point test overrides at the operational server. Agent turns are opt-in;
use `gpt-6-luna` for test subjects.

`task release:test` checks release selection, tag/manifest agreement, package
contents, private package refusal and shrinkwrap handoff using disposable
repositories and fake publication commands. It never publishes or pushes tags.
`actionlint` and `shellcheck scripts/release/*.sh` validate workflows and scripts.

Before initial publication, `task intents` validates a scratch Git repository
with local-only 0.0.0 baselines for new units. Existing baseline/release tags
are retained. No tags are created in the working repository. CI uses this same
step. After finalization, authoritative annotated baseline records supply the
version history. Tag/main ancestry and registry provenance still require the
finalization release jobs.
