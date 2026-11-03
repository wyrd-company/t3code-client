---
product: t3c
title: Library quick start
order: 40
relationships:
  references: [library, api]
---

# Library quick start

TypeScript client for the [T3 Code](https://github.com/pingdotgg/t3code) server:
the HTTP API, WebSocket RPC, and the auth control plane. It lets a Node program
dispatch, manage, and monitor agent sessions that a person can also open in a
normal T3 Code client.

## What to expect

- No Effect dependency. The library speaks the server's wire formats directly
  and models them with `zod`; the surface is `Promise` and `AsyncIterable`.
- Forward compatible. Unknown keys pass through, unknown union members decode
  as `{ unknown: true, raw }`, and a stream keeps flowing when one item fails
  to decode.
- One credential. An access token, plain or bound to a DPoP key, obtained by
  exchanging a pairing or desktop bootstrap token or issued by
  `t3 auth session issue`.
- Orchestration protocol 2. The socket upgrade and the orchestration HTTP
  routes name the protocol the server requires.

This is an independent project, not part of T3 Code. Each release targets the
latest T3 Code release; the version it is tested against is the `t3` entry in
`devDependencies`.

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

## Vocabulary

T3 Code speaks orchestration protocol 2: a thread holds **runs**, a run is
one prompt's execution made of **turn items** (messages, reasoning, tool
calls, approvals, questions, errors), and a **projection** is a thread's whole
state. In this library a **turn** is one run: `startTurn` sends a message and
the handle follows the run the server links to it.

## What is where

| Facade                  | Purpose                                                                                                       |
| ----------------------- | ------------------------------------------------------------------------------------------------------------- |
| `client.auth`           | Session state, pairing-token exchange, tickets, pairing links, connected clients, scopes.                     |
| `client.server`         | Environment descriptor, config and provider catalog, provider status, usage summary, settings, streams.       |
| `client.projects`       | List, get, snapshot, ensure, create, update, delete projects; Scratch and named new projects; project files.  |
| `client.threads`        | List, get, detail, projection, ensure, launch, update, archive, delete; turns, interrupts, approvals; watch.  |
| `client.shell`          | Lightweight snapshot (active and archived threads) and live streams.                                          |
| `client.vcs`            | Refs, status, worktrees, branches.                                                                            |
| `client.terminal`       | Open, attach, write, resize, close terminals.                                                                 |
| `client.scheduledTasks` | List, get, create, update, enable, delete, run, watch scheduled tasks; webhook endpoints, tokens, deliveries. |
| `client.peerLinks`      | List, link, unlink peer environments; answer an agent's link request.                                         |
| `client.guestShares`    | Create and close a thread's guest link; send or dismiss a guest's message.                                    |
| `client.rpc`            | Typed `call` and `stream` for every registered method, plus `callRaw` and `streamRaw` for a newer server.     |
| `client.routes`         | Typed `call` and `stream` for every registered HTTP route, by name.                                           |
