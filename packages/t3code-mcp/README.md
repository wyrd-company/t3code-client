---
relationships:
  implements: mcp
---

# @wyrd-company/t3code-mcp

Stdio MCP tools to dispatch, message, wait on and read threads across named T3
Code servers. Built on the official MCP SDK and `@wyrd-company/t3code-lib`.
Requires Node >=22.16.

```sh
npm install -g @wyrd-company/t3code-mcp
t3code-mcp pair alpha https://server.example < pairing-token.txt
t3code-mcp servers --probe
claude mcp add --transport stdio t3code-mcp -- t3code-mcp
# Or: codex mcp add t3code-mcp -- t3code-mcp
```

Profiles are shared with `t3c`. Configure multiple servers through profiles or
`T3CODE_MCP_CONFIG`; URL entries use `tokenEnv`, never inline tokens.

Dispatch flow: `server_list → server_capabilities → thread_launch → thread_wait
→ thread_read / pending_request_respond / thread_send`. Retain a launch's
`clientRequestId` for safe retries. A wait timeout leaves remote work running.

Use `--read-only`, `--allow-tools` and `--deny-tools` to choose exposed tools.
`approval_respond` requires an exact allow-list entry. Per-server policy can
restrict tools and runtime modes. `t3code-mcp tools` prints the exposed set.

[Documentation](https://wyrd.foo/t3code-mcp/) covers configuration, tool arguments
and Claude/Codex plugin installation. The package includes the Claude plugin;
the Codex marketplace entry uses the published npm package at a pinned version.

Development: `task mcp:check`; protocol cases: `task mcp:test:protocol`.
`T3_LIVE_AGENT=1 task mcp:test:live` runs Luna turns on two temporary servers,
including an agent dispatching through this MCP server to the other server.
The live harness copies required provider auth into temporary homes without
printing it, then stops its owned processes and removes its directories.
