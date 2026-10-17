# t3code-client

![t3c runs a Luna conversation and lists the thread](packages/t3code-cli/docs/assets/demo.gif)

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

User guide: [getting started](packages/t3code-cli/docs/index.md),
[profiles](packages/t3code-cli/docs/auth.md),
[command behavior](packages/t3code-cli/docs/commands.md),
[output and exits](packages/t3code-cli/docs/policy.md),
[Dagu](packages/t3code-cli/docs/dagu.md), and
[library API](packages/t3code-cli/docs/library.md).

`task docs` generates the public pages and JSDoc library reference.
`task demo` records real commands with a fresh pinned server home and
`gpt-6-luna`, writing `packages/t3code-cli/docs/assets/demo.gif`.

Root verbs run the workspace. Package Taskfiles supply the same verbs:
`install`, `build`, `fmt`, `lint`, `typecheck`, `test`, `test:live`, `package`,
and `check`. Registered CLI commands without implementations fail explicitly.

See [testing](docs/testing.md), [releasing](docs/releasing.md), and the
[library design](packages/t3code-lib/docs/design.md).

## License

MIT
