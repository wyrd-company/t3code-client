---
product: t3c
title: Output, exits and requests
order: 4
relationships:
  references:
    - command-line
    - library
    - releasing
---

# Execution, output and failures

The [CLI specification](https://github.com/wyrd-company/t3code-client/blob/main/docs/specifications/command-line.yml)
and its native command asset define the command contract. This guide explains its use.

## Output

In text execution mode stdout contains only the assistant message. Progress,
thread id and warnings go to stderr. A failure ends stderr with one short error
line; Dagu displays the last 1024 bytes. Diagnostic output redacts credentials.
Successful `thread start` without `--wait` prints the thread id as its result.
Inspection, auth and version commands print their requested information.
Non-execution JSON uses `{data, exitCode, error?}`; `thread start` without
`--wait` places its thread/run ids in `data`.

Without `--stream`, `--json` prints exactly one object on stdout. Execution
results contain `threadId`, `runId`, `state`, `assistantMessage`,
`pendingRequests`, `exitCode` and `durationMs`, plus `error` on failure.
Dispatch results also report `runtimeMode`, the mode sent by this invocation, or
null when no mode was sent. Waiting on an existing run sends no mode. Nonwaiting
`thread start` includes `runtimeMode` in `data`. The sent mode is printed on
stderr only at `info` or `debug` log level.
This execution envelope applies to `run`, `thread start --wait`, `thread send`
and `thread wait`. Unavailable ids are null.
`durationMs` is elapsed invocation time. Known thread/run identities remain
available on failures after dispatch. Pre-dispatch failures carry no created
thread identity. The object reports the actual observed state, including an
active run at detach and pending requests at exit `7`.

`--stream` writes assistant deltas in text mode and newline-delimited events in
JSON mode. JSON streaming is the explicit exception to the one-object output
contract. Stream consumers receive the final execution result with its exit
code. Text streaming does not append a duplicate copy of the final answer.

The final answer source is the turn outcome's assistant message. When it is
absent, the CLI falls back to the last assistant item in the transcript.
Oversized-transcript fallback uses the detail route as defined in
[command behavior](commands.md).

## Run lifecycle

`run` has no default run timeout. `--timeout` bounds waiting on `run`,
`thread wait` and `thread send`. `--on-timeout detach|interrupt` defaults to
`interrupt` for `run` and `thread send`, and `detach` for `thread wait`.

Detach leaves the run active, reports the thread id and exits `5`.
Interrupt calls the library interrupt with `holdQueue`, waits up to five seconds after the interrupt request
for terminal state and exits `6` whether or not terminal confirmation arrives.
The JSON result reports the last observed state. Connection/auth failures while requesting
interruption retain their mapped error and known thread/run identity.

One SIGTERM/SIGINT scope spans prompt reading, preflight, dispatch and following
for `run`, `thread start` (with or without `--wait`) and `thread send`.
During preflight, the first signal exits `4`, creates no thread or run and
reports null identities (`data: null` for nonwaiting `thread start`).
Once a mutation is sent, the CLI retains its acknowledgement without aborting
or retrying that request. After a signal, it sends no further mutation in the
dispatch pipeline. A thread creation or title update links no run: after its
acknowledgement the CLI exits `4`, reports the known thread identity with a null
run id, and sends no interrupt. For a run-linking mutation (`startTurn` or
`launch`), the CLI waits for the linked run through the existing handle, interrupts
that exact run with `holdQueue`, and exits `4` with the thread and run identities
on stderr and in the envelope. An acknowledgement or link failure exits `4`
with the known thread identity and the failure in `error`.
A second signal exits immediately, including while a receipt or run link is pending.

During following, the first signal interrupts the run and exits `4`.
When the run is already terminal, the first signal aborts
the remaining read and sends no interrupt. Exit `4` means the CLI was
interrupted before it finished its work; the envelope's `state` carries what
the run did. Signal handlers retain the thread id for recovery and
close the client's local resources. Closing the client does not delete a
thread or its history.

Pending user-input or approval requests during `run` fail fast by default:
exit `7`, print human-readable questions with request ids on stderr in text
mode or in `pendingRequests` in JSON mode, and leave the thread open.
`--on-request wait` keeps waiting until the run timeout, when one is present.
`--approve accept|reject` applies the selected decision only to approval
requests. User-input questions are never auto-answered. Interactive prompts
are gated on a TTY; non-TTY harness execution follows the specified policy.

## Exit codes

| Code | Meaning                                         |
| ---- | ----------------------------------------------- |
| 0    | Completed                                       |
| 1    | Unexpected CLI error                            |
| 2    | Usage error                                     |
| 3    | Run failed or rolled back                       |
| 4    | Interrupted or cancelled, including by signal   |
| 5    | Timed out, run still active; thread id reported |
| 6    | Timed out and the CLI interrupted the run       |
| 7    | Blocked on user-input or approval request       |
| 8    | Server unreachable or connection lost           |
| 9    | Credential rejected or scope missing            |
| 10   | Thread, project or model not found              |

The CLI never emits `124`. Failures `2`, `8`, `9` and `10` detected before
dispatch create no thread. Errors after launch preserve any created thread id;
a failed command is not evidence that no thread exists. The CLI does not retry
a launch blindly after an ambiguous transport failure.

## Failure mapping

The CLI branches on library error classes, stable codes and typed records,
rather than message text. The library uses `T3StorageError` (`storage`) for
profile/config and credential backend I/O, and `T3DecodeError` for malformed
stored credentials. These failures exit `1`; server transport
`T3ConnectionError` (`connection`) exits `8`.
Configuration and input checks precede dispatch;
server reachability, authentication, required scopes and explicitly selected
resources are resolved before a new thread is launched.

| Surface                                                                                                    | Library/error evidence                                                                          | CLI result                                                                                          |
| ---------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| Bad command, flag, duration, conflicting/present blank input                                               | commander validation or caller-input `T3PreconditionError`                                      | 2; no dispatch                                                                                      |
| Missing connection/current profile, unknown switch/logout profile, invalid URL or malformed profile config | profile-operation `T3PreconditionError`                                                         | 2; no dispatch                                                                                      |
| Unreadable prompt/config/credential file or failed config/credential persistence                           | profile/config `T3StorageError` (`storage`), credential-file `T3DecodeError`, or CLI file error | 1; preserve any existing profile/thread identity                                                    |
| Rejected or expired token, denied grant                                                                    | `T3AuthError`, `auth_invalid` or `insufficient_scope`; typed auth failure                       | 9; include required scope when available                                                            |
| Missing selected thread/project/model                                                                      | `T3NotFoundError` or typed resource-not-found RPC result                                        | 10                                                                                                  |
| Network, failed open, closed/lost connection, unusable protocol                                            | `T3ConnectionError`                                                                             | 8                                                                                                   |
| Connect deadline                                                                                           | transport `open_failed` or connection-wait `T3TimeoutError`                                     | 8                                                                                                   |
| Run deadline                                                                                               | CLI run deadline or run-wait `T3TimeoutError`                                                   | 5 for detach; 6 after interruption                                                                  |
| Caller cancellation or signal                                                                              | `T3InterruptedError` or observed interrupted/cancelled outcome                                  | 4                                                                                                   |
| Failed or rolled-back execution                                                                            | `TurnOutcome.state`                                                                             | 3                                                                                                   |
| Pending question or approval                                                                               | pending runtime request                                                                         | 7 unless the requested policy resolves it or keeps waiting                                          |
| Typed dispatch refusal                                                                                     | `T3RpcError`                                                                                    | 9/10 for typed auth/resource failures; 3 for execution failure; 1 for unclassified dispatch failure |
| Server HTTP failure, malformed response, RPC defect                                                        | `T3HttpError`, `T3DecodeError`, `T3RpcDefectError`                                              | 1 unless a specific mapping above applies                                                           |
| Unexpected local failure                                                                                   | CLI error boundary                                                                              | 1                                                                                                   |

A transport failure after dispatch leaves the server outcome unknown and exits
`8` with known identities. A watch decode error is reported through library
stream semantics; an unusable result fails through the CLI error boundary.
`auth status` retains every profile's result. Its exit follows the effective
selection when a flag or environment override is supplied, otherwise the current
profile. No current and no override exits 0. Profile config and credential I/O
errors use the library `storage` code and exit 1; `connection` errors exit 8. Errors never print stored token contents.
