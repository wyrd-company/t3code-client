---
docs: true
title: Tools
order: 3
relationships:
  references: mcp
---

Use `server_list → server_capabilities → thread_launch → thread_wait → thread_read`.
Answer questions with `pending_request_respond`, then wait again. Continue a
conversation with `thread_send`. All tools except `server_list` accept optional
`server`. Each result identifies its server; multi-server waits identify each
thread as `{server, threadId}` and use `server: null` at the top level.

Results are compact JSON in `structuredContent` and one text block.
`offset` defaults to 0 and `limit` to 50. Pages return `items`, `total` and
`nextOffset` (null at the end). Timeline items are chronological.

| Tool                      | Arguments beyond `server`                                                                                                                                                                    | Result                                                                                     |
| ------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| `server_list`             | `probe` (false)                                                                                                                                                                              | `servers`; probing adds reachability, version, environment or error per server             |
| `server_capabilities`     | None                                                                                                                                                                                         | Provider instances, models, model options, runtime modes and server version                |
| `project_list`            | `offset`, `limit`                                                                                                                                                                            | Project ids, titles and workspace roots                                                    |
| `project_ensure`          | `workspaceRoot`, optional `title`                                                                                                                                                            | Existing or created project id, title, root                                                |
| `thread_list`             | `projectId`, `status`, `title` substring, `settled`, `includeArchived` (false), `offset`, `limit`                                                                                            | Newest-first thread summaries                                                              |
| `thread_read`             | `threadId`, `view` (`messages` or `activity`), `offset`, `limit`, `maxCharsPerItem` (4000)                                                                                                   | Thread state, latest run, pending requests, timeline, `truncatedItemIds`                   |
| `thread_launch`           | Exactly one of `projectId`, `workspaceRoot`, `scratch:true`; required `modelSelection`; optional `title`, `initialMessage`, `workspace`, `runtimeMode`, `interactionMode`, `clientRequestId` | Thread reference, latest run state, requests, `resumed`                                    |
| `thread_send`             | `threadId`, `text`, `mode` (`auto`, `queue`, `steer`, `restart`), optional `runtimeMode`, `modelSelection`                                                                                   | Thread reference, message id, dispatch sequence and delivery mode                          |
| `thread_wait`             | `threads: [{server, threadId}]`, `until` (`any` or `all`, default `all`), `timeoutMs`                                                                                                        | Thread states, requests, elapsed time, `timedOut`                                          |
| `thread_interrupt`        | `threadId`, optional `runId`                                                                                                                                                                 | Thread reference and interrupt receipt; no active or named run returns `interrupted:false` |
| `thread_update`           | `threadId`, `action` (`rename`, `settle`, `unsettle`, `archive`, `unarchive`); `title` for rename                                                                                            | Thread reference and action                                                                |
| `pending_request_list`    | `threadId`                                                                                                                                                                                   | Open requests with kinds, ids, questions or approval choices                               |
| `pending_request_respond` | `threadId`, `requestId`, `answers` map from question id to JSON value                                                                                                                        | Response receipt                                                                           |
| `approval_respond`        | `threadId`, `requestId`, `decision` (`accept`, `acceptForSession`, `acceptAlways`, `decline`, `cancel`)                                                                                      | Approval receipt; explicit operator opt-in required                                        |

`modelSelection` is `{instanceId, model, options?}`. Options are an array of
`{id, value}` with string or boolean values. Discover them on the target server.
`workspace` defaults to `{type:"root"}`; it also accepts
`{type:"existing_worktree",worktreePath,branch?}` or
`{type:"worktree",baseRef,branch?,startFromOrigin?}`. Root can include `branch`.
`interactionMode` is `default` or `plan`.

Use a stable `clientRequestId` when retrying launch: server name and request id
determine a UUID v5 thread id. The server reuses that thread without sending the
initial message again. Keep the server name stable across retries. A send cannot
be idempotent: after a lost response, read the thread before sending again.
`auto` delivery lets the server choose; `queue` waits behind active work;
`steer` and `restart` target an active run.

A wait completes when any/all latest runs are terminal or a thread has an open
request. This condition is `done:true` in read, launch and wait results. An idle
thread without a run or pending request has `done:false`. `settled` always means
the T3 user/auto settle marker, independent of `done`, across all thread views. Timeouts default to 45 seconds
and cannot exceed 600 seconds. A timeout does not stop work. Repeat the wait
when `timedOut` is true. An MCP cancellation stops the wait and its subscriptions.
When the request includes a progress token, notifications arrive every 15 seconds.

Thread reads use the library transcript and fall back to thread detail when the
server reports a transcript size limit. `messages` keeps user and assistant rows;
`activity` includes all supported timeline rows. Payload strings longer than the
item limit are cut recursively, except ids, type, status and timestamps; `truncatedItemIds` names the affected items.

Tool failures return `isError: true` and `{error:{code,message}}`.
Malformed schema inputs are rejected by the MCP SDK as error results.

| Code                  | Meaning                                                      |
| --------------------- | ------------------------------------------------------------ |
| `invalid_input`       | Invalid arguments beyond schema validation                   |
| `server_required`     | No target or unambiguous default                             |
| `server_unknown`      | Target is not configured                                     |
| `server_unreachable`  | Connection or open failed                                    |
| `auth_invalid`        | Credential missing or rejected                               |
| `not_found`           | Project, thread or request absent                            |
| `invalid_state`       | Operation is not allowed in the current thread/request state |
| `tool_denied`         | Per-server policy refuses the tool                           |
| `runtime_mode_denied` | Mode exceeds the per-server cap                              |
| `upstream_error`      | Other library or server failure                              |

Use `thread_read` to inspect uncertain dispatch outcomes before retrying mutations.

Probing with `server_list` or `servers --probe` has a 5 second per-server deadline
covering client acquisition, upstream reads and error redaction. An expired probe reports
`reachable:false` and a deadline reason.

Client acquisition and startup credential loading use the same 5 second deadline.
Cancellation abandons an acquisition when no callers remain; a later call can retry.
Shutdown closes acquired clients without waiting for pending profile I/O. Error
messages use a session credential snapshot and withhold upstream text while that
snapshot is incomplete or unavailable.
