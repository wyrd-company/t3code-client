---
relationships:
  references:
    - command-line
    - design
    - releasing
---

# @wyrd-company/t3code-cli

Reserved private package for `t3c`, a Node command that composes
`@wyrd-company/t3code-lib`. The CLI scaffold owns the command implementation,
commander dependency, executable export and npm shrinkwrap.

Taskfile verbs pass with an explicit reserved message. They do not validate a
CLI implementation. The scaffold removes `private`, fills these verbs and
supplies a package containing `dist/cli.js` and `npm-shrinkwrap.json`.

Release unit: `t3code-cli`. See [workspace releases](../../docs/releasing.md).

The [CLI specification](../../specifications/command-line.yml) defines the command
contract; [the package design](docs/design.md) links its technical design.
