---
t3c-docs: patch
t3code-lib: minor
t3code-mcp: minor
t3mcp-docs: patch
---

Add local server reads and stop. The library adds `client.localServers` (`LocalServersApi`): `list` returns one fresh scan of the local servers that the server finds on its host (listeners that it attributes to a thread terminal or a thread's agent, plus configured URLs that answer as web servers), `watch` follows changes, both with `orchestration:read`, and `stop({ pid, port })` stops a thread-attributed listener's process group with `terminal:operate`. `t3code-mcp` adds `local_servers` (optional `threadId` filter and `urls` to probe) and `stop_local_server`, which stops only a listener that the named thread's agent started and refuses servers in thread terminals with code `terminal_owned`.
