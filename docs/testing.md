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
Fake-tool Homebrew regressions verify that a mismatched download preserves the
formula, HEAD and index, and that an existing installation permits only the
preflight call before rejection.
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
runs a `gpt-6-luna` prompt and thread listing. A hidden real `version --json`
preflight verifies the pinned server version and protocol. Package and consumer
checks verify the actual package versions. Captured
command exits, the exact generic answer and the same completed thread identity
must agree before the renderer succeeds. Sanitized output records actual server
version/protocol, owned homes, subject identity and cleanup.

`task demo:check` repeats that real acceptance into an owned temporary GIF, so
exact-head verification does not replace the committed recording. Normal live
server overrides remain available outside isolated demo/acceptance commands.
`task docs` generates the public pages and reference; published navigation tests
verify their metadata, local links and registered GIF asset.

## Consolidated command proof

Agent acceptance spends provider credit and is explicit; ordinary `task check`
keeps agent cases skipped. To retain evidence outside the checkout:

```bash
T3C_ACCEPTANCE_OUTPUT=/tmp/sample-acceptance-evidence task cli:acceptance
```

Use a fresh output directory for each run. Acceptance clears operational server,
token, server-home, workspace and keep overrides, selects `gpt-6-luna`, and
creates a fresh server and profile root under `/tmp`. The output directory holds
command arguments, generic prompt inputs, stdout, stderr, exit codes and linked
thread/run identities. Pairing arguments are redacted. Its server directory
records the launcher and native server PID/start identities, actual version and
protocol, stop observations, sanitized log and home removal. The acceptance
command checks those lifecycle records before it reports success. Temporary
profile and workspace homes are removed with the acceptance root; evidence is
retained only when the output directory is outside that root.

The consolidated suite exercises the existing auth, inspection, dispatch and
wait recipes plus these boundaries:

- `largeTranscript.live.test.ts` stores a 51 MiB user message with the supported
  library `message.dispatch` command and `defer_start`. The stock server's
  transcript route must return `thread_transcript_too_large`; the built CLI's
  detail fallback must return that exact full text. The preparing run selects
  Luna but is never released to the provider. No server/storage patch is used.
- `timeoutQueue.live.test.ts` queues a successor behind an active Luna run.
  `thread wait --timeout 1s` must detach with exit 5 and the active run identity.
  A second wait with `--on-timeout interrupt` must exit 6, observe the selected
  run interrupted and retain its successor as `queued` with `queueHeld: true`.
- `questions.live.test.ts` uses plan interaction mode so Luna can ask a real
  question. Default and both approval policies must exit 7 with that question
  pending. Explicit `thread respond --answer` resolves it; `run --on-request
wait` completes after the explicit answer. `thread wait` has no `--on-request`
  option.
- `stream.live.test.ts` checks real text and NDJSON deltas, one final result and
  no repeated final text. `secondSignal.live.test.ts` sends distinct SIGINT and
  SIGTERM after dispatch and checks immediate exit 4 without a final envelope.
  Existing live run/wait cases check first-signal interruption and recovery ids.

Held in-flight mutation receipts, a signal during a held terminal-answer read,
transport/auth failure during interruption, grace expiry without confirmation,
and malformed/error states use focused controlled readers in the unit suite.
Wall-clock live signal sampling does not prove a receipt was held. These are
fixture boundaries, not claims that the real server produced those failures.
A live case that cannot induce its required state fails; record it as unverified
and obtain an adjudicated disposition before handoff.

For Dagu, retain both tarballs produced by `scripts/release/verify-package.sh`
with their SHA256 and SHA512 SRI, then install them together through the local
consumer recipe in `scripts/release/verify-consumer.sh`. The CLI pack regenerates
its library integrity binding. Use the installed `t3c` binary with the isolated
server recipe from [library testing](../packages/t3code-lib/docs/testing.md),
feed prompts on stdin, preserve reported thread ids, continue with `run --thread`,
and test `--timeout 1s --on-timeout detach` before an explicit interrupt.
Staged package versions remain `0.0.0` until release finalization.
