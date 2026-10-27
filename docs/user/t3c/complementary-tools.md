---
product: t3c
title: MCP integration
order: 7
relationships:
  references: [mcp, profiles]
---

# MCP integration

[t3mcp](https://wyrd.foo/tools/t3mcp) exposes complementary tools for T3 Code
agents, using the same saved profiles as t3c. Pair a profile with `t3c auth pair`
and select it with `t3code-mcp --profile <name>`.

Use the [t3mcp setup guide](https://wyrd.foo/docs/t3mcp/getting-started) and
[tool reference](https://wyrd.foo/docs/t3mcp/tools) for host configuration,
scheduler endpoints, webhook diagnostics, thread inspection and queue recovery.
