---
product: t3c
title: Working with threads
order: 41
relationships:
  references: [library, api]
---

# Working with threads

Read, watch and control threads.

## Reading threads

`client.threads.findByNativeSession(providerInstanceId, nativeSessionId)` returns
the matching T3 Code thread id or `null`. It searches active and archived threads,
including earlier sessions after provider switches. Provider means an exact
instance id; session means `nativeThreadRef.nativeId`. Multiple matching threads
raise `T3PreconditionError`, and read failures propagate.

Thread inspection reads the full HTTP detail. `threads.status(id)` returns the
thread record, active and latest runs, queued runs with `queueHeld`, pending
approval/question counts and the shell's background work (`null` when the shell
does not list the thread). `threads.usage(id)` returns provider-thread context
usage and provider-turn usage with their owning ids; absent usage stays absent.
`threads.diff(id, range?)` diffs the whole thread through the latest completed
checkpoint, or the exact `{ fromTurnCount, toTurnCount }` range.
`orchestration.getThreadTitles` takes `threadIds` and returns the titles of the
threads that exist, archived ones included, keyed by id. Unknown and deleted ids
are absent. On a server that advertises `threadLinkMetadata`,
`orchestration.getThreadLinkMetadata` returns `{ title, projectId }` the same way.
`orchestration.subscribePromptSuggestion` streams the predicted next prompt of a
thread, `{ runId, text }` or `null` when there is none.

```ts
const titles = await client.rpc.call("orchestration.getThreadTitles", { threadIds: [threadId] });
```

`threads.search({ query, limit? })` returns at most `limit` (default and maximum 50) threads, one match each, and reports the limit. `threads.searchContent(input)`
is the server's within-thread find.

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
run, `queue` waits behind it, and `start` insists on a new run. `freshContext:
true` starts a new provider session without the thread's earlier context. The
earlier runs stay visible, and the message never steers. The run and its user
message report `freshContext`.

Pass a JSON Schema object as `outputSchema` to ask a new run for structured
data. A message with `outputSchema` cannot steer an active run. If the agent
submits a value the server accepts, read it from `run.output.value`.

```ts
const turn = await client.threads.startTurn({
  threadId,
  text: "Summarize the changes in one sentence.",
  outputSchema: {
    type: "object",
    properties: { summary: { type: "string" } },
    required: ["summary"],
  },
});
const { run } = await turn.completion;
console.log(run.output?.value);
```

A `thread.settle` command can carry `expectedLatestRunId`. The server then
refuses the settle with `OrchestrationV2DispatchCommandError` when the thread's
latest run is a different one.

## Stop and queue controls

Native thread controls are available through `client.threads`:

- `stopThread(threadId, options?: {reason?: string}, signal?)` sends native Stop
  without an active-run lookup. It works for idle, queued and background work.
  Any reason string, including empty or padded text, passes unchanged.
- `resumeQueue(threadId, signal?)` resumes held queued messages.
- `startQueuedRun(threadId, runId, signal?)` selects a queued plain user message
  on a stopped thread. Select `runId` from `status(threadId).queuedRuns` or
  stock MCP's `queuedRunId`.

Resume and selected Start clear the hold on **all** queued runs. Selected Start
chooses that message first; other queued messages may follow. Each method
resolves on command acknowledgement, forwards cancellation and propagates
server dispatch errors. No capability or version gate or fallback is applied.
The legacy `stop(threadId, signal?)` keeps its active-run interruption with
`holdQueue`, including a no-op when idle.

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

When a `feedback_request` turn item is pending, show its `preview` to the user.
Call `agentFeedback.answerRequest` with `{ threadId, turnItemId, answer }`,
where `answer` is `"send"` or `"decline"`. Send `includeConversation: true`
only if the user wants to include the card's conversation trace. The call
needs `orchestration:operate`. Read these cards from thread turn items.

## Scheduled tasks

To clear a scheduled task's thread binding on T3 Code 0.1.12, send
`unbindThread: true` with no `threadId` to `client.scheduledTasks.upsert`
along with the task's configuration. The next run starts a thread.
An omitted or null `threadId` alone can preserve the thread bound by a first
run when the task retains a one-thread mode.

## Durable workflows

Enable the server's `workflowsEnabled` setting to use durable workflows.
A workflow can run steps, wait for a person's answer and resume later.
Use its [webhook](guide-remote-access.md#guests-and-webhooks) to start a
webhook-triggered workflow, then use the returned `runId` to follow it.

`workflows.subscribe` streams recent runs and open questions. Request
`changes: true` to receive changes after the initial snapshot and apply each
item with `schemas.workflow.applyWorkflowRunsUpdate`.

```ts
import { schemas } from "@wyrd-company/t3code-lib";

let snapshot: schemas.workflow.WorkflowRunsSnapshot | undefined;
for await (const item of client.rpc.stream("workflows.subscribe", { changes: true })) {
  if (item.kind === "decode-error") throw item.error;
  snapshot = schemas.workflow.applyWorkflowRunsUpdate(snapshot, item.value);
  console.log(snapshot.runs.find((run) => run.runId === runId)?.status);
}
```

Call `workflows.get` with `{ runId }` to read the result, steps and
references. Use the `workflows.counts` stream for `needsYou`, `active`
and `total` counts. Both calls and the subscription need
`orchestration:read`.

With `orchestration:operate`, answer an open question through
`workflows.answer` with `{ runId, name, choice }`. Use
`workflows.resume` or `workflows.cancel` with `{ runId }` to resume
a paused run or cancel it.

`workflows.getDefinition` reads definition files with `filesystem:read`.
`workflows.saveDefinition` takes `{ name, source }`, and
`workflows.deleteDefinition` takes `{ name }`. Both need
`terminal:operate` and return `{ changed, problems }`. Check
`problems` after saving to see whether the server could load the change.

## Idempotent operations

| Operation                | Key                                | Behaviour                                                                     |
| ------------------------ | ---------------------------------- | ----------------------------------------------------------------------------- |
| `projects.ensure`        | normalised `workspaceRoot`         | returns the existing project, renames it when the title differs, else creates |
| `projects.ensureScratch` | the server's Scratch root          | the server returns its Scratch project, else creates it                       |
| `threads.ensure`         | caller-supplied `threadId`         | returns the existing thread (active or archived), else creates                |
| `threads.launch`         | `threadId` + `reuseExistingThread` | the server returns the existing thread with `resumed: true`                   |
| `auth.setAccessToken`    | token                              | validates, then stores                                                        |
| `*.delete`               | id                                 | an absent resource resolves without error                                     |
