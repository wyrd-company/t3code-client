---
t3c-docs: patch
t3code-lib: minor
t3code-mcp: minor
t3mcp-docs: patch
---

Add read-only terminal reads. The library adds `TerminalApi.observe`, `TerminalApi.watchMetadata`, `TerminalApi.list` (every terminal, from the first metadata snapshot) and `TerminalApi.read` (one terminal snapshot with its retained history), all with `terminal:read`. `t3code-mcp` adds `thread_terminals`, which lists the server terminals of a thread, and `terminal_output`, which returns the bounded plain-text tail of one terminal's history with its status and exit details. Neither tool starts, attaches to or writes to a terminal.
