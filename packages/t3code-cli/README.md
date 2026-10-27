# @wyrd-company/t3code-cli

![t3c pairs a profile, starts and waits for a thread, and lists projects](https://raw.githubusercontent.com/wyrd-company/t3code-client/main/docs/user/t3c/assets/demo.gif)

`t3c` runs conversations on a stock T3 Code server from your terminal or
an automation harness. Node >=22.16 is required.

```sh
npm install -g @wyrd-company/t3code-cli
# or
brew install wyrd-company/tools/t3c
```

Pair a link from upstream `t3 pair` with `t3c auth pair '<pairing-link>'`, then:

```sh
t3c auth status
t3c run 'Reply with one short greeting.' --model gpt-6-luna
t3c thread list
t3c thread read <thread-id> --last
t3c thread find --provider <instance-id> --session <native-session-id>
```

Execution prints the assistant answer to stdout and progress/thread identity to
stderr. `--json` provides structured results; `--stream` emits incremental output.
`run` has no default run deadline; `--timeout 5m` bounds waiting.
`t3c version` reports client, library, target and reachable server versions.
`t3c --version` prints the package version.
`thread find` prints a T3 Code thread id or literal `null`, with exit `0` for
either result. It includes archived threads. `--json` puts the id or null in
`data`. Provider means the exact instance id used by `run --provider`.
`thread status`, `requests`, `usage` and `diff` inspect one thread;
`diff --from-turn N --to-turn M` selects an exact checkpoint range.
`thread search <query>` returns at most `--limit` threads (default 50);
`--thread <id>` searches within one thread. A missing thread exits `10`.

`schedule` manages tasks, webhook endpoints and delivery records. Create and
update accept `--input <file>` or `--input -` for structured JSON; omitted update
fields keep their stored values. `provider status [instance-id]` reports current
provider diagnostics. `usage summary --since-day YYYY-MM-DD --until-day YYYY-MM-DD
--time-zone Etc/UTC` reads historical usage. See [schedules, providers and usage](https://github.com/wyrd-company/t3code-client/blob/main/docs/user/t3c/automation.md)
for execution selections, webhook input and hourly usage options.

Native Stop and queue controls acknowledge requests:

```sh
t3c thread stop <threadId> [--reason text]
t3c thread queue resume <threadId>
t3c thread status <threadId>
t3c thread queue start <threadId> <runId>
```

Stop sends the native thread command even for idle, queued or background work.
The optional reason is preserved exactly. Queue Start selects a queued plain
user message on a stopped thread. Select its ID from the `queuedRun` rows in
text status, `queuedRuns` in JSON status, or stock MCP's `queuedRunId`.
Both queue Resume and selected Start clear the hold on **all** queued runs;
selected Start chooses that message first, and other messages may follow.
Success reports request acknowledgement, not completion. JSON uses the normal
`{data, exitCode, error?}` envelope with `threadId` and, for Start, `runId`.
`thread interrupt` and run signal/timeout handling retain their behavior.

Read [getting started](https://github.com/wyrd-company/t3code-client/blob/main/docs/user/t3c/getting-started.md), [auth/profiles](https://github.com/wyrd-company/t3code-client/blob/main/docs/user/t3c/auth.md),
[commands](https://github.com/wyrd-company/t3code-client/blob/main/docs/user/t3c/commands.md), [output and exit codes](https://github.com/wyrd-company/t3code-client/blob/main/docs/user/t3c/policy.md),
[the Dagu harness](https://github.com/wyrd-company/t3code-client/blob/main/docs/user/t3c/dagu.md), and [the library API](https://github.com/wyrd-company/t3code-client/blob/main/docs/user/t3c/library-reference.md).
Use `t3c --help` or a command's `--help` for options.

From the source workspace, `task docs` generates the user reference and
`task demo` records `docs/user/t3c/assets/demo.gif` against a fresh pinned server using
`gpt-6-luna`. See workspace [testing](https://github.com/wyrd-company/t3code-client/blob/main/docs/technical-designs/testing.yml) and
[release gates](https://github.com/wyrd-company/t3code-client/blob/main/docs/technical-designs/releasing.yml).
