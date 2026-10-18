---
docs: true
title: Plugins
order: 4
relationships:
  references: mcp
---

The npm package includes a Claude Code plugin manifest and `.mcp.json`. The MCP
server key is `t3code-mcp`; the plugin runs
`node ${CLAUDE_PLUGIN_ROOT}/dist/cli.js` over stdio.

Install `t3code-mcp` from the Wyrd agent marketplace in Claude Code:

```text
/plugin install t3code-mcp
```

The Codex plugin entry is maintained in the Wyrd agent marketplace repository.
Install that entry from Codex's plugin marketplace. It runs the published npm
package through `npx` at the version pinned by the marketplace.

Both plugins use shared t3c profiles or `T3CODE_MCP_CONFIG`. Pair servers once
with `t3code-mcp pair` or `t3c auth pair`. For tokenEnv configurations, provide
the token in the MCP process environment, not in the config file. See
[configuration](configuration.md) for profiles and tool filters.

The plugin installation includes only cross-server thread and project tools.
The T3 Code application's own MCP server supplies tools for its local environment.
Marketplace publication and the initial npm release are separate operator steps.
