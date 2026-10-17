# @wyrd-company/t3code-cli

Node >=22.16 command-line client for stock T3 Code. `t3c version` reports the
CLI, library and target versions and an informational server verdict.
`t3c --version` prints the CLI package version. `--json` emits structured data.

The complete command tree is available through `t3c --help` and command help.
Auth, thread, run, project and server commands are registered placeholders until
their implementations land. A placeholder exits with failure.

Read [command behavior](docs/command-contract.md), [output](docs/output-contract.md)
and the [Dagu harness contract](docs/harness.md).
