---
relationships:
  references: design
---

# @wyrd-company/t3code-lib

TypeScript client for the [T3 Code](https://github.com/pingdotgg/t3code) server:
the HTTP API, WebSocket RPC, and the auth control plane. It lets a Node program
dispatch, manage, and monitor agent sessions that a person can also open in a
normal T3 Code client.

- No Effect dependency. The library speaks the server's wire formats directly
  and models them with `zod`; the surface is `Promise` and `AsyncIterable`.
- Forward compatible. Unknown keys pass through, unknown union members decode
  as `{ unknown: true, raw }`, and a stream keeps flowing when one item fails
  to decode.
- One credential. A bearer access token, obtained by exchanging a pairing
  token or issued by `t3 auth session issue`.
- Orchestration protocol 2. The socket upgrade and the orchestration HTTP
  routes name the protocol the server requires.

This is an independent project, not part of T3 Code. Each release targets the
latest T3 Code release; the version it is tested against is the `t3` entry in
`devDependencies`.

See [`docs/design.md`](docs/design.md) for the architecture and
[`docs/testing.md`](docs/testing.md) for tests.

## Install

```bash
pnpm add @wyrd-company/t3code-lib
```

Node 22.16 or newer. Install the optional peer dependency `ws` as well:

```bash
pnpm add ws
```

The client uses `ws` when it is installed and the built-in `WebSocket`
otherwise. `ws` accepts the large shell and thread snapshots a busy server
sends; the built-in `WebSocket` of some Node builds (undici 7.24, Node 25.9)
drops any compressed message over 4 MiB. Pass `webSocket` to choose
an implementation yourself.

## Quick start

```ts
import { T3Client, fileCredentialStore } from "@wyrd-company/t3code-lib";

const client = T3Client.create({
  baseUrl: "http://127.0.0.1:3773",
  credentials: fileCredentialStore("/var/lib/example-app/t3-credentials.json"),
  clientLabel: "example-app",
});

// First run: exchange a pairing token (from `t3 auth pairing create`).
await client.auth.exchangePairingToken("ABCDEF123456");
// Or: await client.auth.setAccessToken(process.env.T3_TOKEN);

const project = await client.projects.ensure({ workspaceRoot: "/srv/sample", title: "sample" });
const thread = await client.threads.ensure({
  threadId: stableThreadId, // a ThreadId you generate and remember
  projectId: project.id,
  title: "Summarize the changes",
  modelSelection: { instanceId: "codex", model: "gpt-5.6-luna" },
  runtimeMode: "auto",
});

const turn = await client.threads.startTurn({ threadId: thread.id, text: "Summarize the diff." });
for await (const item of turn.events()) {
  switch (item.kind) {
    case "assistant-delta":
      process.stdout.write(item.delta);
      break;
    case "approval-requested":
      await client.threads.respondToApproval({
        threadId: thread.id,
        requestId: item.requestId,
        decision: "accept",
      });
      break;
    case "user-input-requested":
      await client.threads.respondToUserInput({
        threadId: thread.id,
        requestId: item.requestId,
        answers: Object.fromEntries(item.questions.map((q) => [q.id, "yes"])),
      });
      break;
  }
}
const outcome = await turn.completion; // { state: "completed" | "interrupted" | "failed" | ..., assistantMessage, run, projection }

await client.close();
```

A thread can also be launched into its own worktree with a first message in
one call:

```ts
const launched = await client.threads.launch({
  projectId: project.id,
  title: "Fix the flaky test",
  modelSelection: { instanceId: "codex", model: "gpt-5.6-luna" },
  workspace: { type: "worktree", baseRef: "main" },
  initialMessage: { text: "Find and fix the flaky test." },
});
```

## What is where

| Facade            | Purpose                                                                                                      |
| ----------------- | ------------------------------------------------------------------------------------------------------------ |
| `client.auth`     | Session state, pairing-token exchange, tickets, pairing links, connected clients, scopes.                    |
| `client.server`   | Environment descriptor, config and provider catalog, settings, config and lifecycle streams.                 |
| `client.projects` | List, get, snapshot, ensure, create, update, delete projects; Scratch and named new projects; project files. |
| `client.threads`  | List, get, detail, projection, ensure, launch, update, archive, delete; turns, interrupts, approvals; watch. |
| `client.shell`    | Lightweight snapshot (active and archived threads) and live streams.                                         |
| `client.vcs`      | Refs, status, worktrees, branches.                                                                           |
| `client.terminal` | Open, attach, write, resize, close terminals.                                                                |
| `client.rpc`      | Typed `call` and `stream` for every registered method, plus `callRaw` and `streamRaw` for the rest.          |

## Vocabulary

T3 Code speaks orchestration protocol 2: a thread holds **runs**, a run is
one prompt's execution made of **turn items** (messages, reasoning, tool
calls, approvals, questions, errors), and a **projection** is a thread's whole
state. In this library a **turn** is one run: `startTurn` sends a message and
the handle follows the run the server links to it.

## Idempotent operations

| Operation                | Key                                | Behaviour                                                                     |
| ------------------------ | ---------------------------------- | ----------------------------------------------------------------------------- |
| `projects.ensure`        | normalised `workspaceRoot`         | returns the existing project, renames it when the title differs, else creates |
| `projects.ensureScratch` | the server's Scratch root          | the server returns its Scratch project, else creates it                       |
| `threads.ensure`         | caller-supplied `threadId`         | returns the existing thread (active or archived), else creates                |
| `threads.launch`         | `threadId` + `reuseExistingThread` | the server returns the existing thread with `resumed: true`                   |
| `auth.setAccessToken`    | token                              | validates, then stores                                                        |
| `*.delete`               | id                                 | an absent resource resolves without error                                     |

## Errors

Every failure is a `T3Error` with a stable `code`:

| Class                 | `code`                               | When                                               |
| --------------------- | ------------------------------------ | -------------------------------------------------- |
| `T3AuthError`         | `auth_invalid`, `insufficient_scope` | 401 or 403, or a scope check before sending        |
| `T3NotFoundError`     | `not_found`                          | 404                                                |
| `T3HttpError`         | `http`                               | any other non-2xx                                  |
| `T3RpcError`          | `rpc_failed`                         | the server answered an RPC with a tagged error     |
| `T3RpcDefectError`    | `rpc_defect`                         | the server died handling an RPC                    |
| `T3StorageError`      | `storage`                            | profile config or credential backend I/O           |
| `T3ConnectionError`   | `connection`                         | socket open failed, closed, ping timeout, protocol |
| `T3DecodeError`       | `decode`                             | a server payload did not match the schema          |
| `T3PreconditionError` | `precondition`                       | invalid input caught before sending                |
| `T3InterruptedError`  | `interrupted`                        | a call or stream was cancelled                     |

## Typed turn items and errors

Turn items are typed by `type`. An item of a type this client does not
recognise arrives with `unknown: true` and its raw record; arrays in a
projection drop such items, as the T3 clients do:

```ts
for (const item of detail.projection.turnItems) {
  if (isTurnItemOfType(item, "command_execution")) {
    console.log(item.input, item.exitCode);
  }
}
```

`T3RpcError.record` is the server's error, typed by its `_tag`;
`error.is("OrchestrationV2DispatchCommandError")` narrows it.

## Scopes

The server grants granular permissions (`orchestration:read`,
`orchestration:operate`, `filesystem:read`, `filesystem:write`,
`source-control:write`, `terminal:read`, `terminal:operate`, and more) and
reports them in `permissions`; `scopes` carries only the vocabulary older
clients knew. `grantedScopes(state)` reads the grant from whichever is present.
Every registered RPC method knows the scope it needs, so a missing one fails
locally with `insufficient_scope`.

## Watching threads

`T3Client.create` accepts optional connection timing: `backoff` (the exported
`BackoffPolicy`: `initialMs`, `factor`, `maxMs`, optional `jitter`),
`pingIntervalMs`, `missedPongLimit`, and `openTimeoutMs`. Defaults remain a
500 ms × 1.5 reconnect backoff capped at 5 s with jitter 0.2, a ping every
5 s, and a drop after 3 unanswered pongs at the next interval. There is no
open timeout unless supplied. `openTimeoutMs` bounds the WebSocket handshake
after URL and header resolution; expiry abandons that socket and retries with
backoff.

`client.shell.snapshot()` reads the shell: projects, active threads, and
archived threads. `client.threads.detail(threadId)` reads a thread's full
projection over HTTP and `client.threads.projection(threadId)` a bounded one
over RPC.

Thread and shell watches wait through transient connection failures, including
an unavailable server at startup and repeated empty subscriptions. They resume
from the last cursor and filter replay overlap. Credential rejection ends the
watch with an error; abort ends it quietly, and closing the client ends it with
a connection error.

`client.threads.watch(threadId)` yields the server's stream items
(`snapshot`, `synchronized`, `event`) plus derived items: `assistant-delta`
(the assistant text so far and what the last update appended),
`approval-requested`, `user-input-requested`, `request-resolved`,
`turn-settled`, `decode-error`, and `reconnected` after the socket was lost
and the subscription resumed from the last sequence. Pass `afterSequence`
to resume from a sequence you stored.

`startTurn` takes `delivery`: `auto` (default) lets the server steer or queue
the message when a run is active, `steer` and `restart` target the active
run, `queue` waits behind it, and `start` insists on a new run.

## Development

```bash
pnpm install
pnpm run check        # format and lint
pnpm run typecheck
pnpm run test         # unit tests, no server needed
pnpm run test:live    # starts the pinned t3 server, see docs/testing.md
task check            # all of the above
```

Releases use the independent `t3code-lib` release unit; see [`docs/releasing.md`](docs/releasing.md).

## License

MIT
