---
docs: true
title: Configuration
order: 2
relationships:
  references: [mcp, profiles]
---

Flags override environment variables, which override the JSON config file.
Without a `servers` map, all shared t3c profiles are configured servers.
An explicit empty map selects no servers. The default config file is
`$XDG_CONFIG_HOME/t3code-mcp/config.json`, or `~/.config/t3code-mcp/config.json`.
A missing default file is allowed. A missing explicit file, invalid JSON or
invalid shape stops startup. Diagnostics go to stderr.

| Setting          | Flag                         | Environment                 | Default                   |
| ---------------- | ---------------------------- | --------------------------- | ------------------------- |
| File             | `--config PATH`              | `T3CODE_MCP_CONFIG`         | Default config path       |
| Selected servers | `--server NAME` (repeatable) | `T3CODE_MCP_SERVERS`        | Config map, else profiles |
| Default target   | `--default-server NAME`      | `T3CODE_MCP_DEFAULT_SERVER` | File setting              |
| Allowed tools    | `--allow-tools LIST`         | `T3CODE_MCP_ALLOW_TOOLS`    | `*`                       |
| Denied tools     | `--deny-tools LIST`          | `T3CODE_MCP_DENY_TOOLS`     | None                      |
| Read-only        | `--read-only`                | `T3CODE_MCP_READ_ONLY=1`    | Off                       |

Environment server/tool lists are comma-separated. Blank environment values are
unset. `T3CODE_MCP_READ_ONLY=0` explicitly disables the file's read-only setting.
Profile storage follows `T3C_CONFIG_HOME`, then XDG/home, as in t3c.

```json
{
  "servers": {
    "alpha": {},
    "beta": { "profile": "alternate" },
    "ci": { "url": "https://server.example", "tokenEnv": "SAMPLE_T3_TOKEN" }
  },
  "defaultServer": "alpha",
  "allowTools": ["*"],
  "denyTools": ["thread_interrupt"],
  "serverPolicies": {
    "ci": {
      "allowTools": ["server_*", "project_list", "thread_*"],
      "denyTools": ["thread_interrupt"],
      "maxRuntimeMode": "auto-accept-edits"
    }
  }
}
```

An empty server entry selects the profile of the same name. A `profile` entry
selects a different saved name. A URL entry requires `tokenEnv`: the named
environment variable supplies an issued access token. Config files cannot
contain tokens. URLs must be HTTP(S) origins with no userinfo, non-root path,
query or fragment. Token environment values are trimmed. Tools cannot change servers or
credentials. One server's failed connection does not prevent access to another.
Clients open on first use and close when the MCP session ends.

Omit a tool's `server` only when there is a `defaultServer` or exactly one
configured server. Otherwise the result is `server_required`. Server selection
flags restrict the configured set; a default target outside that set is an error.

Tool globs support `*` for any run of characters. Startup selects allowed tools,
removes denied tools, then applies read-only. Removed tools do not appear in
`tools/list`. `approval_respond` requires an exact entry in `allowTools`;
wildcards cannot enable it. Read-only still removes it.

Per-server allow and deny lists apply at call time. Deny wins and returns
`tool_denied`. A `maxRuntimeMode` cap orders modes as `approval-required`,
`auto-accept-edits`, `auto`, `full-access`. A launch without a mode uses the cap.
Every capped send supplies an explicit mode: the requested mode within the cap,
or the thread's observed mode bounded to the cap. A broader requested mode returns
`runtime_mode_denied` before dispatch. The library sets mode and sends the message
as separate commands; a concurrent peer can change mode between them.

```sh
t3code-mcp tools --read-only
t3code-mcp serve --server beta --allow-tools 'server_*,thread_*' --deny-tools thread_interrupt
```

`server_list` with `probe:true` and `servers --probe` use a 5 second per-server
probe deadline, including client acquisition, upstream reads and error redaction. A deadline reports
that server as `reachable:false` with a reason. Other servers remain independent.
