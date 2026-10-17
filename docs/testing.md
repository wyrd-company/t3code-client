---
relationships:
  references: testing
---

# Workspace testing

`task check` runs release-intent validation, workspace formatting/linting,
typechecks, unit tests, pinned-server live tests and local pack/consumer checks.
`task lib:check` runs library gates; `task cli:check` runs the CLI build, lint, typecheck, unit, live and package gates.
Registered placeholder commands do not count as implementation evidence.

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

## CLI isolated acceptance

`task cli:acceptance` builds the library and CLI, then starts the pinned stock
server through the shared library live setup. Its fresh `/tmp/t3c-acceptance-*`
root is outside Git even if the caller's TMPDIR is inside a checkout. It clears
inherited `T3_LIVE_URL`, `T3_LIVE_TOKEN`, server/home/workspace/keep overrides and
ordinary server/token overrides before setup. This clearing applies only to the
isolated acceptance process. Ordinary `task lib:test:live` and `task cli:test:live`
retain intentional `T3_LIVE_URL`/`T3_LIVE_TOKEN` external-server selection.

The setup issues an upstream session credential; the CLI live test uses the
library to create a pairing credential and pair a fresh profile. It runs the
built `version --json`, verifies source reporting and server/protocol/verdict,
and runs a `gpt-6-luna` subject through the library when `T3_LIVE_AGENT=1`.
The auth live suite exercises link/query/split-token and both stdin paths,
exact named status, current selection, failed credentials and switch/logout.
Its Luna subject uses the credential paired by the built CLI. The inspection,
wait and run suites drive the built `t3c` with `gpt-6-luna` subjects: project
and server inspection, transcript reads, interrupt and approval responses;
`thread wait` completion, detach, timeout interruption, signals, idle threads
and pending requests; and every prompt source, Scratch and project-path
selection, continuation, worktree launches, `thread start`, `thread send`,
runtime mode reporting, approval decisions and pre-dispatch failures that
leave no thread. Provider request states that a live subject cannot induce
reliably use controlled fakes in unit tests.

Sanitized console evidence names the external root, actual owned server home,
profile home, override isolation, subject identity/state and cleanup. It never
prints tokens. The live harness stops its owned server; acceptance removes its
owned temporary root. The user's Codex auth remains in its existing home and is
not read by tests. Only owned processes and homes are removed.

See [CLI composition](../packages/t3code-cli/docs/composition.md) for handler,
output, error context, shrinkwrap and Taskfile ownership interfaces.

## Recorded CLI demonstration

`task demo` starts a fresh pinned server home outside Git and renders the
committed `packages/t3code-cli/demo/demo.tape` to the published GIF. It clears
operational server/token/home overrides and both display variables. The tape
runs the built CLI's version, a `gpt-6-luna` prompt and thread listing. Captured
command exits, the exact generic answer and the same completed thread identity
must agree before the renderer succeeds. Sanitized output records actual server
version/protocol, owned homes, subject identity and cleanup.

`task demo:check` repeats that real acceptance into an owned temporary GIF, so
exact-head verification does not replace the committed recording. Normal live
server overrides remain available outside isolated demo/acceptance commands.
`task docs` generates the public pages and reference; published navigation tests
verify their metadata, local links and registered GIF asset.
