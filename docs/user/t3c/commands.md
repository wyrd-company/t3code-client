---
product: t3c
title: Command behavior
order: 3
relationships:
  references:
    - command-line
    - library
    - releasing
---

# Command behavior

The [CLI specification](https://github.com/wyrd-company/t3code-client/blob/main/docs/specifications/command-line.yml)
and its native command asset define the command contract. This guide explains its use.

The [native command surface](https://github.com/wyrd-company/t3code-client/blob/main/docs/specifications/cli-surface.json) defines
commands, positional arguments, options and input relationships. This guide
explains their use. `t3c` runs on Node >=22.16. Startup checks the Node minimum
and prints a clear error when it is unmet. Argument parsing uses commander.
The target server is stock T3 Code 0.1.2 with orchestration protocol 2.

## Connection and profiles

The library's `ProfileManager` resolves connection inputs. Server selection is
`--server`, then `T3_SERVER_URL`, then the current profile. Credentials are
`--credentials <file>`, then `T3_TOKEN`, then the selected profile's credential
store. `T3_TOKEN` alone uses the current profile's URL. Overrides apply to the
invocation. The profile module is shared with other library consumers.

Environment inputs follow the [library configuration contract](https://github.com/wyrd-company/t3code-client/blob/main/docs/profiles.md#configuration),
including its blank-value handling.

The configuration root is `T3C_CONFIG_HOME`, then `$XDG_CONFIG_HOME/t3c`,
then `~/.config/t3c`. `config.json` holds named servers and `current`. Each profile has its own
0600 credential file in `credentials/`. The secret-free config is written
atomically with mode 0644. URL matching uses the normalized server origin.
Resolution reports which flag, environment or profile source won. An explicit
URL without a matching profile uses empty in-memory credentials unless overridden. `CredentialSource` is the library seam
for a caller-supplied store. The default source uses `fileCredentialStore`.
See [the library profile contract](https://github.com/wyrd-company/t3code-client/blob/main/docs/profiles.md).

Durations are positive numbers with an optional `ms`, `s`, `m` or `h` suffix.
A bare number is seconds. `--log-level` accepts `silent`, `error`, `warn`,
`info` or `debug`, and defaults to `warn`.

`--connect-timeout` maps to library `openTimeoutMs` and defaults to 30 seconds.
The CLI reports a failed connection as exit `8`. This connection control is
separate from the run deadline supplied through `--timeout`.

## Prompt and dispatch

`run` and `thread start` read exactly one prompt source: a positional prompt,
`--prompt-file <file>`, `--prompt-file -`, or stdin when neither is supplied.
A positional prompt conflicts with `--prompt-file` even when a supplied value
is blank. The file form reads the file as text; `-` selects stdin. Interactive
prompts require a TTY. Non-TTY execution consumes the explicit input and
reports missing required inputs as usage errors.

`--project <id>` selects an existing project. `--project-path <dir>` resolves or
ensures that workspace's project through the library. They are mutually
exclusive. With neither supplied, the CLI uses the server Scratch project through
`projects.ensureScratch`. `--provider` identifies a provider instance and `--model` selects
its model from the live server catalog, including custom models. An omitted
provider or model uses the selected project default, then the server-advertised
default. An ambiguous selection exits `2`; an unavailable model exits `10`. `--title`
supplies the thread title. `--mode` passes through the requested runtime mode;
new threads use explicit `--mode`, then the server-advertised
`settings.defaultRuntimeMode`, then the library default when the server advertises
no mode. Continuation sends a mode only when `--mode` is supplied.

`--worktree` launches through `threads.launch` with the new-worktree workspace
strategy. `--base-ref` supplies its base ref and requires `--worktree`. The
server prepares the workspace. Without `--base-ref`, the base is the project's
current checkout (`HEAD`). Root launches use the selected project's root.
`--thread <id>` continues an existing conversation and dispatches a new prompt
through `threads.startTurn`, retaining the existing thread identity. The
library resolves delivery against active server state and links the message to
its run. The CLI follows that linked run, rather than guessing the next run id.
Continuation retains the thread's workspace and project, applies supplied
provider/model/mode/title, and rejects project/worktree relocation flags with
exit `2`.

`run` creates or continues the thread, sends the prompt, waits and prints the
final assistant message. `thread start` accepts the same inputs and exits once
the thread and run exist, printing the thread id. `thread start --wait` uses
`run` behavior, including its timeout and output policies. `thread send
<threadId> <prompt>` dispatches to the existing thread; `--timeout` bounds its
wait. `thread wait <threadId>` waits for that thread's run and accepts
`--timeout` and `--on-timeout`. It captures the active run at invocation, or the
latest run when none is active. An idle thread that has never run reports
`idle`, a null run id and exit `0`.

## Reading and responding

`thread read <threadId>` reads the full transcript by default. `--last` selects the last
assistant message and `--full` selects the full transcript; the flags are
mutually exclusive. When the transcript route refuses an oversized transcript
with `thread_transcript_too_large`, the CLI reads the library's detail route
and derives the equivalent visible conversation. Other read failures retain
their mapped errors. `thread list` lists server thread summaries.

`thread find --provider <instanceId> --session <nativeSessionId>` prints the
matching T3 Code thread id, or literal `null` if none exists. Both outcomes exit
`0`; `--json` returns `{ "data": "thread-id", "exitCode": 0 }` or
`{ "data": null, "exitCode": 0 }`. Provider means the exact provider instance id,
as used by `run --provider`, not a driver kind. The session id is the provider's
native session id (`nativeThreadRef.nativeId`), not a T3 runtime session id.

The lookup searches active and archived threads and earlier provider sessions
after a provider switch. It does not require the provider to remain registered.
Multiple matching T3 threads fail with exit `2`. Read, auth and connection
failures keep their normal errors; they do not mean no match. The library reads
the shell and each full HTTP thread detail, so lookup cost grows with the number of
threads. The lookup does not import, resume or launch a session.

`thread interrupt <threadId>` requests interruption through the library.
`thread respond <threadId> --request <id>` supplies exactly one response kind:
repeatable `--answer k=v` for user-input question answers, `--accept` or
`--reject` for approvals. The CLI uses library response methods; it does not
construct RPC envelopes. Request ids and question keys come from the server.
A user-input response is explicit; approval policy never supplies question answers.

`project list` lists projects. `project ensure <dir>` resolves or creates the
workspace project through `projects.ensure`. Paths refer to the server workspace.
`server info` prints the environment descriptor and the live providers/models.

## Stop and queue recovery

`thread stop <threadId> [--reason <text>]` sends the native Stop command. It
stops active and background work and holds queued messages, including when no
agent run is active. `thread interrupt <threadId>` targets the active run and
can let the next queued message start.

`thread queue resume <threadId>` releases the queue hold. `thread queue start
<threadId> <runId>` selects a queued message to start first and also releases the
queue hold; other queued messages can follow it. Find run ids with `thread
status <threadId>` or the stock queue tools. Starting requires a queued plain
user message and no blocking run; the server rejects invalid selections.

These commands report dispatch acknowledgement. Use `thread status` to inspect
subsequent state. JSON output uses the usual `{data, exitCode, error?}` envelope.
All three controls require `orchestration:operate`.

## Auth commands

`auth pair [link]` exchanges a single-use pairing token or validates an issued
session token before storing it. A link carries `/pair#token=...` or `?token=`.
Split inputs use `--server URL` with exactly one of `--pairing-token T`,
`--pairing-token-stdin`, or `--token-stdin`. The last form imports an already
issued session token; the others exchange a pairing token. `--name` overrides
the default profile name, the server host. Repeated calls add named servers;
the first validated pair becomes current; later additions preserve current.

Token issuance uses upstream `t3 auth session issue --ttl 30d --token-only`,
`t3 auth pairing create`, or `t3 pair`. The CLI consumes their credentials
through the library's native APIs.

`auth status` reports every profile's URL, label, scopes, expiry and current
marker and probes each server's `/.well-known/t3/environment`. It returns
non-zero when the current profile fails, while retaining the other results.
Saved profiles use exact named resolution without overrides. The effective
flag/environment/current selection is probed separately and reports its URL
and server/credential sources. With an override, the exit follows that effective
probe; otherwise it follows current. No current and no override exits 0.
The environment descriptor supplies reachability and label; session state supplies
authentication, scopes and expiry. A supplied past expiry reports `expired`;
rejection without expiry reports `auth_invalid`. Text output lists a table with
the current profile marked and an effective-selection source line.
JSON data contains `profiles`, `current` and `effective`, including each probe's
`reachable`, `authenticated`, `label`, `scopes`, `expiresAt` and optional `error`.
`auth switch <name>` selects the current profile. `auth logout [name]` uses
the named profile, or the current profile when the name is omitted. Logging out
the current profile clears current without selecting another profile.

## Version reporting

`version` prints CLI version, library version and `TARGET_T3_CODE_VERSION`.
When a server is reachable it also prints server version, protocol and a
`match`, `newer` or `older` version verdict. The verdict is informational and
does not gate execution. `--version` prints only `t3c <cli-version>`; a 0.1.0
release prints `t3c 0.1.0`. Library and CLI version independently.

## Structured thread inspection

`thread status <id>` reports active/latest runs, queue position and held state,
request counts and server-derived background work. `thread requests <id>` reads
pending approvals and questions with their prompt details. It does not answer
requests. `thread usage <id>` reads context and provider-turn token/cost records
with their owning ids. Missing usage remains absent or null; it is not zero.

`thread diff <id>` reads through the highest ready checkpoint from a completed
run. Use `--from-turn N --to-turn N` together for an explicit checkpoint range;
zero is the thread start. Unavailable checkpoints retain the server error.
`thread search <query> --limit N` searches across threads (default and maximum
50). A result at its limit can omit matches. `--thread <id>` instead searches
inside one thread and returns the native count and first match. It conflicts
with `--limit`.

## Model options and workspaces

`run`, `thread start` and `thread send` accept repeatable
`--model-option key=value`. Keys and values must match the selected model's live
option descriptors. Boolean values must be `true` or `false`; select values use
advertised choice ids. Duplicate keys fail. Inherited options apply only to the
same provider instance and model. Explicit values replace matching inherited
keys. `--clear-model-options` clears inheritance and can be combined with explicit
entries. Continuation sends no model selection unless a selection flag is given.

New worktrees accept `--branch <name>` and `--start-from-origin` or
`--no-start-from-origin`; these require `--worktree`. When neither origin flag is
given, the server applies its default. `--existing-worktree <dir>` selects a
worktree reported by the server, including its checked-out branch. It conflicts
with new-worktree flags. `--thread` retains its workspace and rejects relocation
flags. Paths identify server workspaces; existing-worktree matching resolves a
relative path against the CLI's current directory.

## Schedules, providers and usage

`schedule list|show|create|update|enable|disable|delete|run` manages scheduled
tasks. Create and update accept `--input <file>` or `--input -` for structured
JSON and focused flags for model/options, workspace, thread target and modes.
`schedule endpoint`, `schedule delivery list|show` and `schedule rotate-token`
expose webhook addresses and delivery diagnostics. Endpoint and delivery access
require `orchestration:operate`. Omitted update values stay unchanged.

`provider status [instanceId]` reads provider availability, authentication and
limits. `usage summary --since-day YYYY-MM-DD --until-day YYYY-MM-DD --time-zone
Etc/UTC` reads historical buckets and source diagnostics with `diagnostics:read`.
See [schedules, providers and usage](automation.md) for trigger forms, execution
selections, JSON fields, hourly windows and clearing semantics.
