---
product: t3mcp
title: Getting started
order: 1
relationships:
  references: [mcp, automation-capabilities, profiles]
---

# Getting started with t3mcp

`@wyrd-company/t3code-mcp` supplies stdio tools for scheduler endpoints, webhook
diagnostics, execution configuration, structured thread inspection, provider
status, historical usage and Stop/queue recovery. Use it beside the built-in T3 Code MCP server.
Stock tools handle ordinary schedule CRUD, run-now, launches, global thread
search, questions, model discovery and queued-message editing.

Use Node >=22.16 and the same saved profiles as t3c. Configure your MCP host
to launch the npm package with `npx`:

```json
{
  "command": "npx",
  "args": ["-y", "@wyrd-company/t3code-mcp", "--profile", "sample"]
}
```

You can also install the executable with `npm install -g
@wyrd-company/t3code-mcp` and use `t3code-mcp --profile sample`.

Pair the profile with `t3c auth pair` first. `--profile` selects an exact saved
profile and ignores environment overrides. Alternatively, `--server` and
`--credentials` use the same resolution as t3c. A named profile conflicts with
direct flags. Without a named profile, `T3_SERVER_URL`, `T3_TOKEN` and the current
t3c profile apply. The process connects when a tool first needs the server.
`t3code-mcp tools` lists the tool names without connecting.

| Tools                                                      | Result                                                                                    |
| ---------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| `scheduled_task_endpoint`                                  | Relative token-bearing path, direct URL, optional Connect URL and signing-secret presence |
| `scheduled_task_deliveries`, `scheduled_task_delivery`     | Delivery outcomes, errors and request details                                             |
| `rotate_scheduled_task_webhook`                            | New endpoint; the previous URL stops working                                              |
| `scheduled_task_configuration`, `configure_scheduled_task` | Full task configuration/run diagnostics; execution-only changes                           |
| `thread_status`, `thread_approvals`                        | Run/queue/background-work state and pending approvals for human review                    |
| `thread_usage`, `thread_diff`, `thread_search_content`     | Usage ownership, checkpoint diff or within-thread search                                  |
| `thread_stop`, `thread_queue_resume`, `thread_queue_start` | Native Stop, queue release or selected queued-message start                               |
| `provider_status`, `usage_summary`                         | Current provider state/limits or historical usage buckets                                 |

Every tool returns matching structured data and JSON text. Failures set
`isError` and return a stable code with fixed text. Protocol cancellation reaches
the library operation. The server adds no per-tool deadline.

Scheduler endpoints, deliveries and mutations require `orchestration:operate`;
usage summaries require `diagnostics:read`. The selected credential controls
access. The server withholds webhook endpoints from read-only credentials. A
direct URL is useful without Connect, but it is reachable only where the selected
server is reachable. Delivery bodies, headers and rendered prompts are untrusted
request data. Signing secrets remain write-only.

`configure_scheduled_task` accepts `{id, configuration}`. Its configuration
contains projectId, nullable threadId, workspaceStrategy, modelSelection,
runtimeMode and interactionMode. Omitted settings stay unchanged; null threadId
starts a fresh thread per run. The update reads then writes and can overwrite a
concurrent edit. Use stock tools for trigger, prompt, title and enablement changes.
Changing the project or thread validates that the resulting bound thread belongs
to the resulting project before saving.

`thread_diff` accepts an optional range with fromTurnCount and toTurnCount; zero
means the thread start. Within-thread search returns a count and a selected match
with native navigation positions. Usage results keep source and pricing metadata.
Missing usage is not zero; session counts overlap across time buckets.

`thread_stop` holds queued messages and stops active/background work even when
no run is active. `thread_queue_resume` releases the hold. `thread_queue_start`
selects a queued plain user message by `runId` and releases the queue hold, so
other queued messages can follow. Get ids from `thread_status` or the stock
queue tools. These tools require `orchestration:operate` and return dispatch
acknowledgements; inspect status for subsequent state. Stock queue editing,
cancellation, reordering and promotion remain in the built-in MCP server.

## Build from source

From a repository checkout, run `task install` and `task build`. Configure the
host to run `node` with the absolute path to
`packages/t3code-mcp/dist/cli.js`, followed by `--profile sample`. Source builds
use the same connection settings and tool inventory as the npm package.
