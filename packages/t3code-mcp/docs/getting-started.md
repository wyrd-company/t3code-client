---
docs: true
title: Getting started
order: 1
relationships:
  references: mcp
---

Install Node 22.16 or later, then install the package:

```sh
npm install -g @wyrd-company/t3code-mcp
```

Create a pairing token in each remote T3 Code server. Pair it through stdin:

```sh
t3code-mcp pair alpha https://server.example < pairing-token.txt
t3code-mcp pair beta https://other.example < other-pairing-token.txt
t3code-mcp servers --probe
```

Pairing uses the same profiles as `t3c auth pair`. Credentials stay in the shared
profile store. Keep token input files private and remove them after pairing.
The MCP process connects to the configured servers; it does not start them.

Register the stdio server in Claude Code:

```sh
claude mcp add --transport stdio t3code-mcp -- t3code-mcp
```

Or register it in Codex:

```sh
codex mcp add t3code-mcp -- t3code-mcp
```

The [plugin installation](plugins.md) provides the same server.
Use [configuration](configuration.md) to restrict tools or select servers.

Ask your agent to perform this dispatch:

1. Call `server_list` to find the server names.
2. Call `server_capabilities` on `beta`. Select an actual provider instance and model.
3. Call `thread_launch` with `server: "beta"`, `workspaceRoot: "/srv/sample"`,
   the discovered `modelSelection`, `clientRequestId: "sample-dispatch"`, and
   `initialMessage: "Inspect the workspace and report what you find."`.
4. Save the returned `{server, threadId}`. Pass it in `thread_wait.threads`.
5. If `timedOut` is true, wait again. If a request is pending, answer it with
   `pending_request_respond`. Read the result with `thread_read`.
6. Send a follow-up with `thread_send`, then wait and read again.

A workspace root is a path on the target server. To create a separate worktree,
pass `workspace: {"type":"worktree","baseRef":"HEAD"}`. `scratch: true` selects
the target server's Scratch project instead of a workspace root.
