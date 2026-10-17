# t3code-client

A pnpm workspace for stock T3 Code 0.1.0, orchestration protocol 2.

- [`@wyrd-company/t3code-lib`](packages/t3code-lib/README.md): TypeScript library
  with HTTP, WebSocket RPC, thread/run facades and auth control plane.
- [`@wyrd-company/t3code-cli`](packages/t3code-cli/README.md): `t3c` command tree,
  version reporting and shared command composition. Auth and execution handlers
  remain implementation work.

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

Root verbs run the workspace. Package Taskfiles supply the same verbs:
`install`, `build`, `fmt`, `lint`, `typecheck`, `test`, `test:live`, `package`,
and `check`. Registered CLI commands without implementations fail explicitly.

See [testing](docs/testing.md), [releasing](docs/releasing.md), and the
[library design](packages/t3code-lib/docs/design.md).

## License

MIT
