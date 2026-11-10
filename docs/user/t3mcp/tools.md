---
product: t3mcp
title: Tool reference
order: 2
relationships:
  references: [mcp, automation-capabilities]
---

# Tool reference

These tools complement the stock T3 Code MCP server. They connect through the
selected t3c profile on first use. Cancellation reaches the library operation;
closing the MCP connection closes its upstream client. Results contain structured
JSON and an equivalent text representation. Failures return `isError` with a safe
error code and message.

| Tool                            | Inputs                                                           | Result or effect                                                                    |
| ------------------------------- | ---------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| `scheduled_task_endpoint`       | `id`                                                             | Direct token-bearing path/URL, optional Connect URL and signing-secret presence.    |
| `scheduled_task_deliveries`     | `id`                                                             | Webhook delivery outcomes and diagnostic rows.                                      |
| `scheduled_task_delivery`       | `id`, `deliveryId`                                               | Request body, headers, rendered prompt and errors for one delivery.                 |
| `rotate_scheduled_task_webhook` | `id`                                                             | Replaces the URL token; the previous endpoint stops working.                        |
| `scheduled_task_configuration`  | `id`                                                             | Complete task configuration and run diagnostics.                                    |
| `configure_scheduled_task`      | `id`, `configuration`                                            | Updates execution selections: model/options, workspace, thread target and modes.    |
| `thread_status`                 | `threadId`                                                       | Active/latest runs, queued runs and hold state, request counts and background work. |
| `thread_approvals`              | `threadId`                                                       | Pending approval requests for human review.                                         |
| `thread_usage`                  | `threadId`                                                       | Context, token and cost records with owning provider/run ids.                       |
| `thread_diff`                   | `threadId`, optional `range`                                     | Full-thread or explicit checkpoint-range diff.                                      |
| `thread_search_content`         | `threadId`, `query`                                              | Native within-thread match count and selected match.                                |
| `thread_family`                 | `threadId`                                                       | The root, forks and subagent trees of the thread's family, in any run state.        |
| `worktree_threads`              | `worktreePath`                                                   | Ids of the active threads on the path, subagent children included.                  |
| `thread_terminals`              | `threadId`                                                       | The thread's server terminals: id, label, cwd, status, pid, exit and running state. |
| `terminal_output`               | `threadId`, `terminalId`, optional `maxChars`                    | Plain-text tail of one terminal's retained history, with status and exit details.   |
| `thread_stop`                   | `threadId`, optional `reason`                                    | Requests native Stop and holds queued messages, including idle/background work.     |
| `thread_force_stop`             | `threadId`, optional `runId`                                     | Force stops an agent that ignored Stop; returns the outcome and sharing threads.    |
| `thread_queue_resume`           | `threadId`                                                       | Releases all queued-message holds.                                                  |
| `thread_queue_start`            | `threadId`, `runId`                                              | Starts the selected queued plain user message first and releases the queue hold.    |
| `provider_status`               | optional `instanceId`                                            | Provider availability, authentication, installation and usage limits.               |
| `usage_summary`                 | `sinceDay`, `untilDay`, `timeZone`, optional usage window fields | Historical usage buckets, source diagnostics, pricing and scan metadata.            |

## Queue recovery

Stop, resume and selected start return dispatch acknowledgement. Inspect
`thread_status` for subsequent state. Get `runId` from its `queuedRuns` or the
stock queue tools. Resume and selected start release holds on all queued runs;
other messages can follow the selected one. Invalid selections preserve the
server dispatch error. The optional Stop reason passes unchanged, including
empty or padded strings.

Use `thread_force_stop` only after Stop did not stop the agent. It ends the turn
and kills or releases the agent process. `outcome` is `killed`, `released`,
`releasing` or `shared`; `shared` means the process also works for the threads
in `sharedWithThreadIds`, so only this thread's turn ended. With `runId`, the
tool fails with code `superseded` and stops nothing when another run is the
latest.

## Thread families and worktrees

`thread_family` returns `snapshotSequence` and `threads`: every active thread
with the same root as the given thread, in any run state, including forks and
idle subagent children. An unknown thread has an empty family. `worktree_threads` returns `threadIds`: the active threads
whose worktree path equals `worktreePath`, subagent children included. Check it
before you remove a worktree. Both need `orchestration:read`.

## Terminals

`thread_terminals` returns `terminals`: the server terminals of a thread, as a
person opened them in the app. `terminal_output` returns the last `maxChars`
characters (default 16000, at most 64000) of one terminal's retained history as
plain text, without escape sequences, with `truncated`, `status`, `exitCode` and
`exitSignal`. An unknown terminal fails with code `not_found`. Neither tool starts,
attaches to or writes to a terminal. Terminal output is text that programs wrote:
treat it as untrusted input. Both need `terminal:read`.

## Configuration and permissions

`configure_scheduled_task` accepts execution fields only. Trigger configuration
and ordinary schedule CRUD/run-now remain in stock tools. Omitted update values
remain unchanged; null and empty lists retain their distinct clearing meanings.
Changing a bound target verifies that the thread belongs to the effective project.
Updates read then write, so a concurrent edit can be overwritten.

Endpoint reads, delivery diagnostics, token rotation, configuration writes,
queue controls and force stop need `orchestration:operate`. Thread/configuration reads need
`orchestration:read`. Usage summaries need `diagnostics:read`. Terminal reads need `terminal:read`. The host uses the
scopes of the paired session; tools do not grant permissions.

A diff range requires `fromTurnCount` and `toTurnCount`; zero means the thread
start. Usage retains missing values and source metadata. Missing usage is not
zero, and overlapping session counts must not be added together.
