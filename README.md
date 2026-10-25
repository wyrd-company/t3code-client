# t3code-client

![t3c pairs a profile, starts and waits for a thread, and lists projects](docs/user/t3c/assets/demo.gif)

A pnpm workspace for stock T3 Code 0.1.0, orchestration protocol 2.

- [`@wyrd-company/t3code-lib`](packages/t3code-lib/README.md): TypeScript library
  with HTTP, WebSocket RPC, thread/run facades and auth control plane.
- [`@wyrd-company/t3code-cli`](packages/t3code-cli/README.md): `t3c` for conversations,
  named server profiles, thread inspection and automation.

Both release units have independent versions and target an initial 0.1.0.
Node >=22.16 and pnpm 11 are required. The root package is private.

```bash
task install
task build
task test
task check
# Run one package directly:
task lib:check
task cli:check
```

User guide: [getting started](docs/user/t3c/getting-started.md),
[profiles](docs/user/t3c/auth.md),
[command behavior](docs/user/t3c/commands.md),
[output and exits](docs/user/t3c/policy.md),
[Dagu](docs/user/t3c/dagu.md), and
[library API](docs/user/t3c/library-reference.md).

`task docs` generates the JSDoc library API and published reference.
The public usage guides are authored in `docs/user/t3c/`.
`task demo` records real commands with a fresh pinned server home and
`gpt-6-luna`, writing `docs/user/t3c/assets/demo.gif`.

Root verbs run the workspace. Package Taskfiles supply the same verbs:
`install`, `build`, `fmt`, `lint`, `typecheck`, `test`, `test:live`, `package`,
and `check`. Registered CLI commands without implementations fail explicitly.

See [testing](docs/technical-designs/testing.yml), [releasing](docs/technical-designs/releasing.yml), and the
[library design](docs/technical-designs/library.yml).

## License

MIT
