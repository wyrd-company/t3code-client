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
| `thread_stop`                   | `threadId`, optional `reason`                                    | Requests native Stop and holds queued messages, including idle/background work.     |
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

## Configuration and permissions

`configure_scheduled_task` accepts execution fields only. Trigger configuration
and ordinary schedule CRUD/run-now remain in stock tools. Omitted update values
remain unchanged; null and empty lists retain their distinct clearing meanings.
Changing a bound target verifies that the thread belongs to the effective project.
Updates read then write, so a concurrent edit can be overwritten.

Endpoint reads, delivery diagnostics, token rotation, configuration writes and
queue controls need `orchestration:operate`. Thread/configuration reads need
`orchestration:read`. Usage summaries need `diagnostics:read`. The host uses the
scopes of the paired session; tools do not grant permissions.

A diff range requires `fromTurnCount` and `toTurnCount`; zero means the thread
start. Usage retains missing values and source metadata. Missing usage is not
zero, and overlapping session counts must not be added together.
