---
product: t3c
title: Dagu harness
order: 5
relationships:
  references:
    - command-line
    - library
    - releasing
---

# Dagu custom harness

The [CLI specification](https://github.com/wyrd-company/t3code-client/blob/main/docs/specifications/command-line.yml)
and its native command asset define the command contract. This guide explains its use.

The Dagu custom harness starts one `t3c run` process, supplies its prompt on
stdin, and consumes the final assistant message on stdout. Progress and thread
identity go to stderr. The exit code preserves run, request, transport and
credential outcomes; `124` belongs to Dagu.

```yaml
binary: t3c
prefix_args: [run]
prompt_mode: stdin
with:
  model: gpt-6-luna
  project-path: /workspace/project
  timeout: 5m
```

Dagu supplies `T3_TOKEN` and `T3_SERVER_URL` through masked secrets. The CLI
resolves these through the library profile module. An explicit `--server` or
`--credentials` overrides the corresponding environment input. `T3_TOKEN` alone
uses the current profile's server. The process uses the same profile and
credential contract as other library consumers.

Pushback continues the existing conversation with `t3c run --thread <id>` and
a new stdin prompt. Thread ids emitted on stderr remain available when the
process detaches, times out, blocks on a request, or loses its connection.

Without `--timeout`, `run` waits without a run deadline. The Dagu timeout and
the CLI run timeout are separate controls. CLI timeout interruption uses the
library's interrupt operation with `holdQueue`; Dagu can also terminate the
process with a signal. A signal reports exit `4` and the first signal requests
interruption. User-input requests require explicit responses through
`thread respond`; an automated harness does not invent answers.

## Run the committed fixtures

The repository provides [new-run](https://github.com/wyrd-company/t3code-client/blob/main/scripts/dagu/verification.yaml) and
[continuation](https://github.com/wyrd-company/t3code-client/blob/main/scripts/dagu/continuation.yaml) fixtures. They require Dagu
with `harness.run` support, an installed matching CLI/library consumer with its
`node_modules/.bin` first on `PATH`, an available protocol 2 server, and provider
access for `gpt-6-luna`. The recorded fixture verification used Dagu 2.20.1,
Node 24.22.0 and stock T3 0.1.0. These are the tested versions.

Supply `SAMPLE_T3_TOKEN` and `SAMPLE_T3_SERVER_URL` to the Dagu process through
your existing environment setup. The fixtures resolve these as masked
`T3_TOKEN` and `T3_SERVER_URL` secrets. Keep their values out of command
arguments, YAML and collected output. For isolated testing, use an owned server,
profile and project directory, a fresh external Dagu home, and an environment
without inherited operational `DAGU_*`, `T3_LIVE_*`, direct `T3_TOKEN`,
`T3_SERVER_URL` or `T3CODE_HOME` overrides. The setup supplies the two
`SAMPLE_*` environment inputs in memory before invoking Dagu.

From the repository root, copy the fixtures into the owned Dagu home. The
example uses an existing absolute project directory `/workspace/sample`;
replace that JSON value with your owned project directory. Pass each JSON
object as one argument.

```bash
dagu_home=$(mktemp -d /tmp/sample-dagu-XXXXXX)
cp scripts/dagu/verification.yaml "$dagu_home/sample-success.yaml"
cp scripts/dagu/continuation.yaml "$dagu_home/sample-continuation.yaml"
cp scripts/dagu/verification.yaml "$dagu_home/sample-timeout.yaml"

dagu --dagu-home "$dagu_home" validate "$dagu_home/sample-success.yaml"
dagu --dagu-home "$dagu_home" start --run-id sample-success \
  --params '{"PROJECT":"/workspace/sample","PROMPT":"Reply SAMPLE only.","TIMEOUT":"120s"}' \
  "$dagu_home/sample-success.yaml"
dagu --dagu-home "$dagu_home" history sample-success --format json
```

The new-run fixture requires `PROJECT`; its blank default is not a project.
The harness sends the prompt on stdin and invokes `t3c run --model gpt-6-luna
--project-path <project> --timeout 120s`. Success yields `SAMPLE` on stdout,
a `Thread:` identity on stderr, and a successful Dagu step and run.

Read that new thread identity from stderr. Replace `<thread-id>` in the next
JSON object with it. Continuation requires `THREAD` and omits `PROJECT` and
`project-path` so that the conversation retains its workspace.

```bash
dagu --dagu-home "$dagu_home" validate "$dagu_home/sample-continuation.yaml"
dagu --dagu-home "$dagu_home" start --run-id sample-continuation \
  --params '{"THREAD":"<thread-id>","PROMPT":"Pushback: replace the answer with NEXT only.","TIMEOUT":"120s"}' \
  "$dagu_home/sample-continuation.yaml"
dagu --dagu-home "$dagu_home" history sample-continuation --format json
```

Expect `NEXT` on stdout and the same thread identity. Dagu can warn that the
continuation has no working directory; the CLI uses the thread's workspace.
The recorded library assertions verified two distinct completed runs in that
thread.

The timeout case uses the new-run fixture and the same existing project:

```bash
dagu --dagu-home "$dagu_home" validate "$dagu_home/sample-timeout.yaml"
dagu --dagu-home "$dagu_home" start --run-id sample-timeout \
  --params '{"PROJECT":"/workspace/sample","PROMPT":"Use the shell tool to sleep 30 seconds, then reply SAMPLE only.","TIMEOUT":"1s"}' \
  "$dagu_home/sample-timeout.yaml"
dagu --dagu-home "$dagu_home" history sample-timeout --format json
```

Default timeout interruption returns CLI exit `6`, empty stdout, a thread
identity and the final stderr line `t3c: Timed out; interruption requested.`.
Dagu records a failed step with `exit status 6` in its error and returns outer
launcher exit `1` for the failed DAG. These exits are distinct; neither is
`124`. No Dagu `timeout_sec` is added. The recorded fixture verification did
not separately exercise detach exit `5`.

These fixtures invoke the CLI. They do not start a server, issue credentials,
or assert server projections. The recorded verification used a separate test
launcher and the installed library to check prompt/model/project linkage,
thread identity, completed runs and interrupted timeout state. That launcher
is not a tracked repository tool. See [testing design](https://github.com/wyrd-company/t3code-client/blob/main/docs/technical-designs/testing.yml)
for the verification and cleanup boundary.

Keep only sanitized invocation, stdout/stderr and run records. An entire Dagu
home includes generated authentication material and is not an evidence bundle.
After testing, stop or delete owned subject threads through the library, close
the client, stop the owned server, and remove the owned Dagu, server, profile
and project roots. Keep sanitized evidence separately. Use a fresh home and
new subjects for each attempt.
