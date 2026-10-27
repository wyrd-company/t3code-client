---
relationships:
  references: [mcp, automation-capabilities, profiles]
---

# @wyrd-company/t3code-mcp

Complementary stdio MCP tools for stock T3 Code 0.1.2, orchestration protocol 2.
Node >=22.16 is required. The library owns server integration; the official MCP
SDK owns protocol transport.

Build locally with `task build`, then configure your MCP host to launch:

```json
{
  "command": "node",
  "args": ["/absolute/path/to/packages/t3code-mcp/dist/cli.js", "--profile", "sample"]
}
```

Pair the profile with `t3c auth pair` first. `--profile` selects that exact saved
profile and ignores connection environment overrides. Without it, server
selection is `--server`, `T3_SERVER_URL`, then the current t3c profile;
credentials are `--credentials`, `T3_TOKEN`, then the matching profile store.
A named profile conflicts with direct connection flags. No connection is opened
until a tool is called. `t3code-mcp tools` lists names without connecting.

| Tools                                                      | Purpose                                                         |
| ---------------------------------------------------------- | --------------------------------------------------------------- |
| `scheduled_task_endpoint`                                  | Token-bearing path, direct server URL and optional Connect URL  |
| `scheduled_task_deliveries`, `scheduled_task_delivery`     | Webhook outcomes, request details and errors                    |
| `rotate_scheduled_task_webhook`                            | Replace the URL token; the previous URL stops working           |
| `scheduled_task_configuration`, `configure_scheduled_task` | Full read and execution-only updates                            |
| `thread_status`, `thread_approvals`                        | Active/queued runs, background work and pending human approvals |
| `thread_usage`, `thread_diff`, `thread_search_content`     | Usage records, checkpoint diffs and within-thread search        |
| `provider_status`, `usage_summary`                         | Provider availability/limits and historical usage buckets       |

Use built-in T3 tools for schedule CRUD, run-now, launches, global thread search,
questions and model discovery. This package has no approval-answer tool.

Scheduler endpoints, delivery records and mutations require
`orchestration:operate`. Usage summaries require `diagnostics:read`. The selected
credential controls access. A direct webhook URL does not establish public
reachability. Delivery bodies, headers and rendered prompts are untrusted data.
Signing secrets are write-only. Errors use stable codes and fixed text.

`configure_scheduled_task` takes `{id, configuration}`. Configuration accepts
projectId, nullable threadId, workspaceStrategy, modelSelection, runtimeMode and
interactionMode. Omitted fields stay unchanged. A null threadId selects a new
thread per run. Updates read then write; concurrent edits can be overwritten.
Use stock tools to change titles, prompts, triggers or enablement.

`thread_diff` accepts an optional `{fromTurnCount, toTurnCount}` range, where zero
is the thread start. `thread_search_content` returns a count and one match with
native navigation positions. Usage retains source and pricing metadata; missing
values are not zero, and overlapping session counts must not be added together.

Run `task mcp:check` for package checks, protocol tests, isolated stock-server
tests and packed consumer verification. No agent runs are required.
