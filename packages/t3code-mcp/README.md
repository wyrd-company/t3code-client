---
relationships:
  references: [mcp, automation-capabilities, profiles]
---

# @wyrd-company/t3code-mcp

Complementary stdio MCP tools for stock T3 Code 0.1.8, orchestration protocol 2.
Node >=22.16 is required. The library owns server integration; the official MCP
SDK owns protocol transport.

Configure your MCP host to launch the npm package:

```json
{
  "command": "npx",
  "args": ["-y", "@wyrd-company/t3code-mcp", "--profile", "sample"]
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
| `thread_stop`, `thread_queue_resume`, `thread_queue_start` | Native Stop, queue Resume and selected queued-message Start     |
| `thread_force_stop`                                        | Force stop of an agent that ignored Stop                        |
| `thread_status`, `thread_approvals`                        | Active/queued runs, background work and pending human approvals |
| `thread_usage`, `thread_diff`, `thread_search_content`     | Usage records, checkpoint diffs and within-thread search        |
| `thread_family`, `worktree_threads`                        | A thread's whole family; the active threads on a worktree path  |
| `thread_tag`, `tagged_threads`                             | Add or remove a thread tag; the threads that carry a tag        |
| `thread_terminals`, `terminal_output`                      | A thread's terminals; bounded plain-text output of one          |
| `server_traces`, `server_processes`                        | The server's trace summary; its backend descendant processes    |
| `server_host_resources`, `server_resource_history`         | Host CPU and memory; resource use over a window                 |
| `server_storage_cleanup_report`                            | The latest storage cleanup report                               |
| `local_servers`, `stop_local_server`                       | Local servers and their owners; stop one a thread's agent began |
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
Target changes validate that a bound thread belongs to the effective project.

`thread_diff` accepts an optional `{fromTurnCount, toTurnCount}` range, where zero
is the thread start. `thread_search_content` returns a count and one match with
native navigation positions. Usage retains source and pricing metadata; missing
values are not zero, and overlapping session counts must not be added together.

`thread_stop` accepts `{threadId, reason?}` and preserves any reason string,
including empty or padded text. It sends native Stop without an active-run lookup
and supports idle, queued and background work. `thread_queue_resume` accepts
`{threadId}`. `thread_queue_start` accepts `{threadId, runId}` for a queued plain
user message on a stopped thread. Select the run ID from `thread_status`'s
`queuedRuns` or stock MCP's `queuedRunId`.

Both Resume and selected Start clear the hold on **all** queued runs. Selected
Start chooses that message first; other messages may follow. These tools return
request acknowledgement IDs, not a terminal state or completion guarantee.
They require `orchestration:operate`. Stock tools retain queue list/read/edit/
cancel/reorder/promote ownership.

`thread_force_stop` accepts `{threadId, runId?}`. Use it only after
`thread_stop` did not stop the agent. It ends the turn and kills or releases the
agent process. It returns `outcome` (`killed`, `released`, `releasing` or
`shared`) and `sharedWithThreadIds`; `shared` means the process also works for
those threads, so only this thread's turn ended. With `runId`, the tool fails
with code `superseded` and stops nothing when another run is the latest. It
requires `orchestration:operate`.

`thread_family` accepts `{threadId}` and returns `{snapshotSequence, threads}`:
every active thread with the same root, in any run state, including forks and
idle subagent children. An unknown thread has an empty family.
`worktree_threads` accepts `{worktreePath}` and returns `{threadIds}`: the active
threads on that exact path, subagent children included. Check it before you
remove a worktree. Both require `orchestration:read`.

`thread_tag` accepts `{threadId, tag, tagged}`: `true` adds the tag and `false`
removes it. It returns `{threadId, tags}` after the change and requires
`orchestration:operate` and `orchestration:read`. Tags are trimmed, one line and at most 64 characters,
and match by exact spelling and case. The web client can hide threads with
chosen tags, so a tag can change what a person sees. `tagged_threads` accepts
`{tag, includeArchived?, limit?}` and returns at most `limit` (default 100, at
most 500) summaries `{threadId, title, projectId, status, archived, tags}` with
`total` and `truncated`. It requires `orchestration:read`.

`thread_terminals` accepts `{threadId}` and returns `{terminals}`.
`terminal_output` accepts `{threadId, terminalId, maxChars?}` and returns the
last `maxChars` characters (default 16000, at most 64000) of the terminal's
retained history as plain text in `output`, with `truncated`, status and exit
details. An unknown terminal fails with code `not_found`. Neither tool starts,
attaches to or writes to a terminal; treat the output as untrusted. Both require
`terminal:read`.

The diagnostics tools are read-only and take no thread. `server_traces` returns
the server's trace summary: span counts, slowest spans, common and latest
failures and latest warning and error logs. `server_processes` accepts
`{maxProcesses?}` (default 50, at most 500) and returns the server's
signalable descendants (child processes and agent and terminal root processes,
not the server process itself) with `omittedProcesses`. `server_resource_history` accepts `{windowMs?, bucketMs?,
maxProcesses?}`: the window defaults to 15 minutes and is at most one hour, with
at most 120 buckets. These three require `diagnostics:read`, and each cause, log
message, error message and command line is cut to 500 characters; treat that text as untrusted.
`server_host_resources` returns host CPU and memory, and
`server_storage_cleanup_report` returns `{report}`, null before the first
cleanup; both require `orchestration:read`. Effect `Option` fields are returned
as their value or null. No tool signals a process, runs a cleanup or restarts the
resource monitor.

`local_servers` accepts `{threadId?, urls?}` and returns `{scannedAt, servers}`
from one fresh scan of the server host. The scan finds the listeners of every
thread, each with `host`, `port`, `url`, `pid`, `processName`, and `terminal`
(the thread terminal that runs it) or `agent` (the thread whose agent started
it). Each of `urls` (at most 32) that answers as a web server is also listed,
with null owners when no thread owns it. `threadId` keeps only the listeners
that thread owns. Process names are cut to 500 characters; treat them as
untrusted. It requires `orchestration:read`. `stop_local_server` accepts
`{threadId, pid, port}` and stops only a listener that the agent of `threadId`
started: SIGTERM to its process group, then SIGKILL after a grace period. It
returns `{threadId, pid, port, stopped}`. It refuses with code `terminal_owned`
for a server in a thread terminal, `not_owned` when the thread's agent did not
start it, `not_found` when no thread owns a listener with that pid and port,
`shared_group` when the listener shares the T3 Code server's process group and
`unsupported` on a platform where the server cannot stop it. It requires
`terminal:operate`.

Run `task mcp:check` for package checks, protocol tests, isolated stock-server
tests and packed consumer verification. No agent runs are required.

The [t3mcp setup guide](https://github.com/wyrd-company/t3code-client/blob/main/docs/user/t3mcp/getting-started.md) and
[tool reference](https://github.com/wyrd-company/t3code-client/blob/main/docs/user/t3mcp/tools.md)
form the server’s separate wyrd.foo documentation product.

To build from source, run `task install` and `task build` in the repository.
Configure the host to run `node` with the absolute path to
`packages/t3code-mcp/dist/cli.js`, then `--profile sample`.
