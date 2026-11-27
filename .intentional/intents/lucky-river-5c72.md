---
t3code-lib: major
---

The public `schemas.terminal.TerminalWriteInput` schema now validates `data` together with the write phase. If you derived a schema with `.pick()`, `.omit()` or `.partial()`, build a separate schema from `.shape` and add the validation it needs, or validate the full write directly. Use `.safeExtend()` when replacing fields in the write schema and keeping its validation. Ordinary terminal writes still take nonempty `data`.
