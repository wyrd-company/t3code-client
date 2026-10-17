---
relationships:
  references:
    - command-line
    - library
    - command-contract
    - output-contract
    - harness
---

# t3code-cli technical design

The [CLI design](../../../technical-designs/command-line.yml) is the canonical
Refinery technical-design artifact. The [CLI specification](../../../specifications/command-line.yml)
and [native command surface](../../../specifications/assets/cli-surface.json)
define the command contract. [Command behavior](command-contract.md),
[output and failures](output-contract.md) and the [Dagu harness](harness.md)
carry its normative semantics. The [library design](../../../technical-designs/library.yml)
defines the underlying stock-server contract.
