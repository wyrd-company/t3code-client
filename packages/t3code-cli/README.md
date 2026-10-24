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
```

Execution prints the assistant answer to stdout and progress/thread identity to
stderr. `--json` provides structured results; `--stream` emits incremental output.
`run` has no default run deadline; `--timeout 5m` bounds waiting.
`t3c version` reports client, library, target and reachable server versions.
`t3c --version` prints the package version.

Read [getting started](https://github.com/wyrd-company/t3code-client/blob/main/docs/user/t3c/index.md), [auth/profiles](https://github.com/wyrd-company/t3code-client/blob/main/docs/user/t3c/auth.md),
[commands](https://github.com/wyrd-company/t3code-client/blob/main/docs/user/t3c/commands.md), [output and exit codes](https://github.com/wyrd-company/t3code-client/blob/main/docs/user/t3c/policy.md),
[the Dagu harness](https://github.com/wyrd-company/t3code-client/blob/main/docs/user/t3c/dagu.md), and [the library API](https://github.com/wyrd-company/t3code-client/blob/main/docs/user/t3c/library-reference.md).
Use `t3c --help` or a command's `--help` for options.

From the source workspace, `task docs` generates the user reference and
`task demo` records `docs/user/t3c/assets/demo.gif` against a fresh pinned server using
`gpt-6-luna`. See workspace [testing](https://github.com/wyrd-company/t3code-client/blob/main/docs/technical-designs/testing.yml) and
[release gates](https://github.com/wyrd-company/t3code-client/blob/main/docs/technical-designs/releasing.yml).
