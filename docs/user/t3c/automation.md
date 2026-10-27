---
product: t3c
title: Schedules, providers and usage
order: 8
relationships:
  references: [command-line, cli-surface, automation-capabilities, profiles]
---

# Schedules, providers and usage

These commands use the selected server [profile](auth.md). Text output uses
concise tab-separated lines. `--json` returns one `{data, exitCode, error?}`
object. Normal [exit codes](policy.md) apply.

## Scheduled tasks

```sh
t3c schedule list
t3c schedule show <task-id>
t3c schedule create --title 'Sample notes' --prompt 'Summarize the sample notes.' \
  --every 1h --provider codex --model gpt-6-luna --mode approval-required --disabled
t3c schedule update <task-id> --at 09:30 --weekdays 1,3,5
t3c schedule enable <task-id>
t3c schedule disable <task-id>
t3c schedule run <task-id>
t3c schedule delete <task-id>
```

Choose a trigger with `--every <duration>` (at least `1m`), `--at HH:MM` with
optional `--weekdays 0,1,2,3,4,5,6` (Sunday is `0`), or `--webhook`. Fixed times
use the server's local clock. `schedule run` requests an immediate run and
returns the task; it does not wait for the assistant. The server refuses manual
runs of webhook tasks and tasks that are already running.

Create needs a title, prompt and trigger. It defaults to enabled; `--disabled`
creates it disabled. A prompt can come from `--prompt` or `--prompt-file <file>`;
`--prompt-file -` reads stdin. Without a project selection, create uses the
selected thread's project, or the scratch project. Model defaults come from the
thread, project or server; runtime mode comes from the server. Use `--mode` when
no server default is available. Interaction mode defaults to `default` and the
workspace defaults to the project root.

Create and update accept a JSON object with `--input <file>` or `--input -` for
stdin. Focused flags override matching JSON fields. Only one input can read
stdin. The accepted fields are `title`, `prompt`, `enabled`, `schedule`,
`projectId`, `threadId`, `workspaceStrategy`, `modelSelection`, `runtimeMode` and
`interactionMode`. Identity and provenance fields are not input fields.

```sh
t3c schedule create --input - --project <project-id> --provider codex \
  --model gpt-6-luna --mode approval-required <<'JSON'
{
  "title": "Sample webhook",
  "prompt": "Summarize {{body.action}}.",
  "enabled": false,
  "schedule": {
    "type": "webhook",
    "filters": [{"path": "body.action", "op": "equals", "value": "sample"}]
  }
}
JSON

t3c schedule update <task-id> --input - <<'JSON'
{"schedule":{"type":"webhook","signature":null,"filters":[]}}
JSON
```

An update keeps omitted settings. The library reads the existing task and saves
it with the patch, so concurrent edits can overwrite each other. For a webhook,
omitting the signature, delivery-age bound, dedupe or filters keeps that stored
setting. `signature: null` clears the signature check, `maxDeliveryAgeMinutes:
null` clears its bound, and `filters: []` clears filters. An omitted signing
secret keeps the stored secret. Signature input uses `header`, `encoding`
(`hex` or `base64`), `prefix` and an optional `secret` or `secretRef`. Supply
signing values through JSON input; saved tasks return no signing secret. See the
[library API](library-reference.md) for webhook filters and dedupe fields.

Create and target-changing updates check that a bound thread belongs to the
effective project before saving. This includes a project-only update that keeps
the existing thread. A mismatch exits `2`; failed target reads retain their
normal errors.

Execution selections apply to create and update:

| Selection         | Options                                                                                                         |
| ----------------- | --------------------------------------------------------------------------------------------------------------- |
| Project           | `--project <id>` or `--project-path <directory>`                                                                |
| Target            | `--thread <id>`; update also accepts `--new-thread` to create a thread per run                                  |
| Model             | `--provider <exact-instance-id>`, `--model <slug-or-alias>`                                                     |
| Model options     | Repeat `--model-option key=value`; `--clear-model-options` starts empty                                         |
| Modes             | `--mode <runtime-mode>`, `--interaction-mode <mode>`                                                            |
| New worktree      | `--worktree`, optional `--base-ref <ref>`, `--branch <name>`, `--start-from-origin` or `--no-start-from-origin` |
| Existing worktree | `--existing-worktree <path>` selects the path and branch advertised by the server                               |
| Project root      | `--root`                                                                                                        |

Model options use the selected model's advertised boolean and select choices.
Explicit entries override inherited entries. On update, option flags use the
stored model unless a provider or model selection changes it. A new worktree's
base ref defaults to `HEAD`; an omitted start-from-origin value stays omitted.
JSON `threadId: null` also selects a new thread per run. JSON objects use the
library's `workspaceStrategy` and `modelSelection` types.

## Webhook endpoints and deliveries

```sh
t3c schedule endpoint <task-id> --json
t3c schedule delivery list <task-id>
t3c schedule delivery show <task-id> <delivery-id> --json
t3c schedule rotate-token <task-id> --json
```

Endpoint data includes `taskId`, relative `path`, direct server `url`, optional
or null `connectUrl`, and `hasSecret`. The path and URLs contain the endpoint
token. A direct URL does not establish public reachability. Without T3 Connect,
`connectUrl` is null. Rotation invalidates the old token and returns
`{task, endpoint}` with the replacement endpoint.

Delivery JSON retains the recorded query, headers, body, truncation marker and
rendered prompt. Text leaves headers to JSON. New delivery outcomes remain
strings. Reading schedules needs `orchestration:read`; mutations, endpoint
lookup and delivery records need `orchestration:operate`. Readers without that
scope do not receive webhook endpoints.

## Provider status

```sh
t3c provider status
t3c provider status <exact-instance-id> --json
```

Provider status reports installation, authentication, availability and usage
limits from the live server configuration. An unknown exact instance exits
`10`. Reading status does not log in, install a provider or reset its limits.

## Historical usage

```sh
t3c usage summary --since-day 2026-01-01 --until-day 2026-01-02 \
  --time-zone Etc/UTC --json
t3c usage summary --since-day 2026-01-01 --until-day 2026-01-02 \
  --time-zone Etc/UTC --resolution hour \
  --since-time 2026-01-01T08:00:00Z --until-time 2026-01-02T08:00:00Z --await-refresh
```

Both calendar dates and the IANA time zone are required. `--resolution` accepts
`day` or `hour`; hourly queries require valid `--since-time` and `--until-time`
instants spanning more than zero and at most 24 hours. `--await-refresh` waits
for slow source refreshes instead of cached answers. Usage needs
`diagnostics:read`.

JSON preserves usage buckets, cost-source provenance, source diagnostics,
pricing and scan metadata. Text prints each bucket and source separately.
Reasoning tokens are part of output tokens. Current provider limits and
historical usage remain separate; the CLI does not invent a grand total.
