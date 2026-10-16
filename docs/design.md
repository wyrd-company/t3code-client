---
relationships:
  references:
    - client
    - shell
    - socket
    - threadWatch
---

# T3 Code client: technical design

`@wyrd-company/t3code-client` is a TypeScript library that lets a Node program
drive a T3 Code server the way the T3 web and desktop clients do: create
projects and threads, launch threads into worktrees, start runs, watch a
thread live, answer approvals and questions, and manage the server's auth
control plane. It is the foundation for software-delivery workflows that
dispatch, manage, and monitor agent sessions while a person can still open
the same session in a normal T3 client.

The library is a package that a larger program imports. It is not a workflow
engine, and it does not spawn or install the server.

## Constraints the design answers

- **No Effect dependency.** The server is built on Effect 4 release candidates
  and its contracts package is private to the monorepo. The consumer of this
  library is a plain Node program. The library therefore speaks the server's
  wire formats directly and models them with `zod`, and exposes `Promise` and
  `AsyncIterable` surfaces only.
- **Forward compatibility.** The server evolves weekly. Every object schema is
  loose (unknown keys pass through), every growing literal set decodes an
  unknown member into an `unknown` variant instead of failing, and every
  stream keeps flowing when one item fails to decode.
- **One credential model.** A bearer access token is the only steady-state
  credential. The library obtains one by exchanging a pairing token, or the
  caller supplies one issued by `t3 auth session issue`. The library never
  shells out.
- **Small files, deep modules.** Each module has a small interface and hides
  its implementation. No file over roughly 300 lines. Callers compose the
  facade; tests cross the same seams callers do.

## Vocabulary

The server's orchestration model is its protocol version 2 ("V2"). A
**thread** holds **runs**; a run is one prompt's execution, from the user
message that requested it to a terminal status. A run is made of **turn
items**: the timeline rows of a thread (user and assistant messages,
reasoning, tool calls, approvals, questions, errors), each typed by `type`.
**Runtime requests** are the approvals and questions a provider raises and the
answers it got. A **projection** is one thread's whole state: the thread
record and every array of records that belongs to it. A **shell** is the
lightweight cross-thread view: project and thread summaries.

In this library a **turn** is one run. `threads.startTurn` sends a message
and returns a handle that follows the run the server links to it.

## Wire facts (verified against T3 Code 0.1.0)

The server speaks orchestration protocol 2 and refuses other clients. The
`/ws` upgrade must carry `?orchestrationProtocol=2` (a 426 answers an upgrade
without it), and the orchestration HTTP routes must carry the header
`x-t3-orchestration-protocol: 2`. `ExecutionEnvironmentDescriptor.orchestrationProtocolVersion`
says which protocol a server speaks.

HTTP, all under one base URL:

| Method and path                                       | Auth                 | Notes                                                                                      |
| ----------------------------------------------------- | -------------------- | ------------------------------------------------------------------------------------------ |
| `GET /.well-known/t3/environment`                     | none                 | `ExecutionEnvironmentDescriptor`                                                           |
| `GET /api/auth/session`                               | optional bearer      | `AuthSessionState`; `authenticated:false` without a credential                             |
| `POST /oauth/token`                                   | none                 | form-encoded token exchange; pairing token is single use                                   |
| `POST /api/auth/websocket-ticket`                     | bearer               | `{ticket, expiresAt}`; ticket lives about five minutes                                     |
| `POST /api/auth/pairing-token`                        | bearer, access:write | body `{label?, scopes?}`; the credential is returned once                                  |
| `GET /api/auth/pairing-links`                         | bearer, access:read  |                                                                                            |
| `POST /api/auth/pairing-links/revoke`                 | bearer, access:write | `{id}` → `{revoked}`                                                                       |
| `GET /api/auth/clients`                               | bearer, access:read  | `AuthClientSession[]`                                                                      |
| `POST /api/auth/clients/revoke`                       | bearer, access:write | `{sessionId}` → `{revoked}`                                                                |
| `POST /api/auth/clients/revoke-others`                | bearer, access:write | `{revokedCount}`                                                                           |
| `GET /api/projects`                                   | bearer, orch:read    | `ProjectSnapshot`: every project record                                                    |
| `POST /api/projects/mutate`                           | bearer, orch:operate | `ProjectMutation` → `Project`                                                              |
| `GET /api/orchestration/shell`                        | bearer, orch:read    | `OrchestrationV2ShellSnapshot` (protocol header)                                           |
| `GET /api/orchestration/threads/:threadId`            | bearer, orch:read    | `OrchestrationV2ThreadDetailSnapshot`, the full projection; 404 `thread_not_found`         |
| `GET /api/orchestration/threads/:threadId/bounded`    | bearer, orch:read    | `OrchestrationV2ThreadBoundedSnapshot`: a recent window plus `historyCursor`               |
| `GET /api/orchestration/threads/:threadId/history`    | bearer, orch:read    | query `cursor`; `OrchestrationV2ThreadHistoryPage`; 400 `invalid_history_cursor`           |
| `GET /api/orchestration/threads/:threadId/transcript` | bearer, orch:read    | `OrchestrationV2ThreadTranscript`: the visible timeline; 400 `thread_transcript_too_large` |
| `POST /api/pull-requests/diff`                        | bearer               | out of scope for this version                                                              |

HTTP errors are JSON tagged records: `EnvironmentRequestInvalidError` (400),
`EnvironmentAuthInvalidError` (401), `EnvironmentScopeRequiredError` and
`EnvironmentOperationForbiddenError` (403), `EnvironmentResourceNotFoundError`
(404), `EnvironmentInternalError` (500). Each carries `code`, `reason` and
`traceId`. A scope error names the scope the request needs in
`requiredPermission` and its legacy parent in `requiredScope`.

Scopes are granular: `orchestration:read`, `orchestration:operate`,
`settings:write`, `providers:manage`, `environment:maintain`,
`preview:operate`, `diagnostics:read`, `terminal:read`, `terminal:operate`,
`filesystem:read`, `filesystem:write`, `source-control:write`, `access:read`,
`access:write`, `relay:read`, `relay:write`. `review:write` still decodes but
grants nothing. Session state, pairing links, and client sessions report the
whole grant in `permissions` and only the legacy vocabulary in `scopes`;
`grantedScopes()` reads whichever is present. A pairing credential may ask for
any grantable scope.

WebSocket at `GET /ws`. Authentication on the upgrade is either
`?wsTicket=<ticket>` or an `authorization: Bearer` header. Optional query
parameters `clientSurface=cli` and `clientAppVersion` label the connection in
the server's client list. Messages are JSON text, one envelope per frame (the
server may also send a JSON array of envelopes). Envelopes:

```text
client → server
  {"_tag":"Request","id":"<string>","tag":"<method>","payload":{...},"headers":[]}
  {"_tag":"Ack","requestId":"<id>"}          after every Chunk, or the stream stalls
  {"_tag":"Interrupt","requestId":"<id>"}    cancels a stream or call
  {"_tag":"Ping"}                            every ~5 s; the server answers Pong
  {"_tag":"Eof"}

server → client
  {"_tag":"Chunk","requestId":"<id>","values":[...]}          one or more stream items
  {"_tag":"Exit","requestId":"<id>","exit":{"_tag":"Success","value":...}}
  {"_tag":"Exit","requestId":"<id>","exit":{"_tag":"Failure","cause":[
        {"_tag":"Fail","error":{"_tag":"OrchestrationV2DispatchCommandError","message":"…"}}
      | {"_tag":"Die","defect":"Missing key\n  at [\"runId\"]"}
      | {"_tag":"Interrupt","fiberId":797} ]}}
  {"_tag":"Defect","defect":...}             connection-level failure
  {"_tag":"Pong"}
```

`headers` is required on `Request`; omitting it makes the server close the
socket without a reason. A stream ends with an `Exit` (an `Interrupt` cause
after the client cancels). A payload the server cannot decode surfaces as a
`Die` with a string defect, so the client validates payloads before sending
to give a better error.

Orchestration RPC methods (`ORCHESTRATION_V2_WS_METHODS` in the contracts;
scope in `apps/server/src/auth/RpcAuthorization.ts`):

| Method                                   | Scope        | Payload → result                                                                                                                                      |
| ---------------------------------------- | ------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| `orchestration.dispatchCommand`          | orch:operate | `OrchestrationV2Command` → `{sequence}`; fails `OrchestrationV2DispatchCommandError`                                                                  |
| `orchestration.launchThread`             | orch:operate | `OrchestrationV2ThreadLaunchInput` → `{threadId, projection, resumed}`                                                                                |
| `orchestration.getThreadProjection`      | orch:read    | `{threadId}` → `OrchestrationV2ThreadProjection` with a bounded timeline window                                                                       |
| `orchestration.getTurnItem`              | orch:read    | `{threadId, itemId}` → `{item}` with the full, size-bounded input and output                                                                          |
| `orchestration.getWorkflowScript`        | orch:read    | unchanged                                                                                                                                             |
| `orchestration.stopWorkflow`             | orch:operate | `{threadId, subagentId}` → nothing; fails `OrchestrationV2StopWorkflowError` with a `reason`                                                          |
| `orchestration.getTurnDiff`              | orch:read    | unchanged                                                                                                                                             |
| `orchestration.getFullThreadDiff`        | orch:read    | unchanged                                                                                                                                             |
| `orchestration.searchThreads`            | orch:read    | unchanged                                                                                                                                             |
| `orchestration.searchThread`             | orch:read    | `OrchestrationV2SearchThreadInput` → `OrchestrationV2SearchThreadResult`: one match and the navigation around it                                      |
| `orchestration.searchThreadStream`       | orch:read    | the same input → stream of results that converge; the last has `complete: true`                                                                       |
| `orchestration.getArchivedShellSnapshot` | orch:read    | `{}` → `OrchestrationV2ArchivedShellSnapshot`                                                                                                         |
| `orchestration.subscribeArchivedShell`   | orch:read    | stream of `OrchestrationV2ArchivedShellStreamItem`                                                                                                    |
| `orchestration.subscribeShell`           | orch:read    | `{afterSequence?, requestCompletionMarker?}` → stream of `OrchestrationV2ShellStreamItem`                                                             |
| `orchestration.subscribeThread`          | orch:read    | `{threadId, afterSequence?, requestCompletionMarker?, acceptBoundedSnapshot?, acceptCompactTurnItems?}` → stream of `OrchestrationV2ThreadStreamItem` |

Projects are not orchestration commands: `projects.mutate` (orch:operate)
takes a `ProjectMutation` (`project.create`, `project.update`,
`project.delete`) and answers with the `Project`; it fails with
`ProjectMutationError`, whose `cause` names a missing project. A create or
update that carries `scripts` also needs `settings:write`, because project
scripts run on the host. The shell stream reports projects as
`project.updated` and `project.removed`.

A workflow run is a subagent whose `workflow` field carries the provider's
replace-in-full view of the run: an append-only phase list and one entry
per agent. `orchestration.stopWorkflow` stops the run by that subagent; the
`subagent.stop` command stops one provider-native child while its run keeps
working. The server advertises thread find with `threadFind` and
`threadFindProgressive` in `ServerConfig`.

With `acceptCompactTurnItems`, a bounded snapshot may omit from
`projection.turnItems` the items its local visible rows already carry and
sets `turnItemsOmitLocalVisible: true`. `boundedSnapshotProjection` puts
them back; the thread watch does this before it yields the snapshot, so a
watch consumer always sees the whole list.

A thread stream starts with `{kind:"snapshot", snapshotSequence, projection}`
unless `afterSequence` is given, in which case persisted events after it are
replayed instead (the snapshot is still sent when the replay would be too
large or when nothing is newer). `requestCompletionMarker` puts a
`{kind:"synchronized"}` between catch-up and live delivery. Each event is
`{kind:"event", sequence, event}` where the event is an
`OrchestrationV2DomainEvent`: `id`, `threadId`, `occurredAt`, `type`, and a
`payload` that is the whole record the event changed (`thread.*` carry the
thread, `run.created`/`run.updated` a run, `turn-item.updated` a turn item,
`runtime-request.updated` a runtime request, `message.updated` a message,
and so on). Applying an event is an upsert by id; the T3 web client folds
events the same way. `thread.pull-request-link-updated` is the exception: its
payload is one `ThreadPullRequestLink`, which replaces the thread's link with
the same host, repository, and number.

The transcript route answers with the thread's `visibleTurnItems`, its
`title`, and `updatedAt` in one read. It refuses a thread whose transcript is
larger than the server's file attachment limit.

`message.dispatch` carries `dispatchMode` and, optionally, `deliveryIntent`.
With `deliveryIntent: "auto"` the server resolves the mode against its
serialized thread state: a new run when nothing is active, otherwise steer
or queue by the provider's capabilities. The server links the message to its
run: the run's `userMessageId`, and the message record's `runId`. Run
statuses are `preparing`, `queued`, `starting`, `running`, `waiting`, and
the terminal `completed`, `interrupted`, `failed`, `cancelled`,
`rolled_back`. `run.interrupt` needs a `runId`; with `holdQueue` it is the
Stop button. Commands carry `createdBy` and `creationSource` where they
create something; the server stamps `createdBy: "user"` on everything a
client dispatches.

The thread shell carries `status` (`idle` or the latest run's status),
`activeRunId`, `pendingRuntimeRequest`, and `latestVisibleMessage`, so a
list view needs no projection. The shell snapshot has `threads` and
`archivedThreads`, but the server fills `archivedThreads` only on the socket
snapshot; archived threads are read with
`orchestration.getArchivedShellSnapshot`, and `thread.updated` items for
them arrive on `orchestration.subscribeArchivedShell`.

`projects.ensureScratch` finds or creates the environment's Scratch project,
rooted at `ServerConfig.scratchWorkspaceRoot`; the server sends that field
only when its data directory is outside a Git checkout, and fails the call
otherwise. `projects.createNew` makes a folder under
`ServerConfig.newProjectsRoot` with a README, an icon and a first commit,
then creates the project; a failed commit is reported in `commitError` and
keeps the project.

## Caller's view

```ts
import { T3Client, memoryCredentialStore } from "@wyrd-company/t3code-client";

const client = T3Client.create({
  baseUrl: "http://127.0.0.1:3979",
  credentials: memoryCredentialStore({ accessToken: process.env.T3_TOKEN }),
  clientLabel: "sdlc-workflows",
});

// Auth control plane
const state = await client.auth.sessionState();
await client.auth.exchangePairingToken("4BM5VPTCWT7L"); // stores the access token
const link = await client.auth.createPairingCredential({
  label: "reviewer",
  scopes: ["orchestration:read"],
});

// Discover what the server can run
const config = await client.server.getConfig();
const codex = config.providers.find((p) => p.instanceId === "codex");

// Projects and threads, idempotently
const project = await client.projects.ensure({
  workspaceRoot: "/srv/repo",
  title: "repo",
});
const thread = await client.threads.ensure({
  threadId: stableThreadId,
  projectId: project.id,
  title: "Review PR 42",
  modelSelection: { instanceId: "codex", model: "gpt-5.6-luna" },
  runtimeMode: "auto",
});

// Or launch a thread into its own worktree with a first message
const launched = await client.threads.launch({
  projectId: project.id,
  title: "Fix the flaky test",
  modelSelection: { instanceId: "codex", model: "gpt-5.6-luna" },
  workspace: { type: "worktree", baseRef: "main" },
  initialMessage: { text: "Find and fix the flaky test." },
});

// Run a turn and wait for it to settle
const turn = await client.threads.startTurn({
  threadId: thread.id,
  text: "Review the diff.",
});
for await (const item of turn.events()) {
  if (item.kind === "assistant-delta") process.stdout.write(item.delta);
  if (item.kind === "approval-requested")
    await client.threads.respondToApproval({
      threadId: thread.id,
      requestId: item.requestId,
      decision: "accept",
    });
  if (item.kind === "user-input-requested")
    await client.threads.respondToUserInput({
      threadId: thread.id,
      requestId: item.requestId,
      answers: { [item.questions[0].id]: "yes" },
    });
}
const outcome = await turn.completion; // { state: "completed" | "interrupted" | "failed" | ..., assistantMessage, run, projection }

// Watch everything
for await (const item of client.shell.watch({ signal })) {
  /* snapshot, project.updated, thread.updated, thread.removed, ... */
}

// Escape hatch for any RPC method
const diff = await client.rpc.call("orchestration.getTurnDiff", {
  threadId,
  fromTurnCount: 0,
  toTurnCount: 1,
});
for await (const ev of client.rpc.stream("subscribeServerLifecycle", {})) {
}

await client.close();
```

The connection opens lazily on the first RPC use and reconnects with backoff
until `close()`. Every method accepts an `AbortSignal` where waiting is
involved.

## Module map

```text
src/
  index.ts                    public exports only
  client.ts                   T3Client: composition root, close()
  errors.ts                   T3Error hierarchy (one strategy everywhere)
  schemas/                  zod schemas mirrored from packages/contracts
    common.ts               ids, IsoDateTime, looseObject helpers, forwardCompatible helpers
    auth.ts                 scopes, descriptors, session state, tokens, pairing links, clients
    environment.ts          ExecutionEnvironmentDescriptor, repository identity, protocol constants
    httpErrors.ts           Environment*Error records
    rpcErrors.ts            RpcErrorRecord: every tagged error the registered RPC methods declare
    rpcErrors/              orchestration, MCP app, vcs, and terminal error records, shared tagged-error helpers
    mcpApps.ts              MCP App tool calls, tool info, resource reads, model context
    projects.ts             Project, ProjectMutation, icons and scripts, file entries, read/write/search
    orchestration/          mirrors orchestrationV2.ts and the files it imports
      model.ts              ModelSelection, modes, decisions, answers, actor and creation source, ProviderRef
      attachments.ts        ChatAttachment family
      messageContext.ts     OrchestrationMessageContext and its records
      pullRequest.ts        thread ↔ pull request links
      thread.ts             OrchestrationV2AppThread
      runs.ts               runs, attempts, execution nodes, subagents, checkpoints, workspace strategy
      workflow.ts           a workflow coordinator's phases, agents, and run handles
      providerState.ts      provider sessions, threads, turns, runtime requests
      providerCapabilities.ts
      providerRuntime.ts    token usage, tool activity labels
      messages.ts           conversation messages, notifications, plans, questions
      context.ts            context handoffs and transfers
      turnItemParts.ts      turn item base fields, failures, small records
      turnItems.ts          OrchestrationV2TurnItem union, projected rows
      events.ts             OrchestrationV2DomainEvent union
      projection.ts         OrchestrationV2ThreadProjection, detail, bounded, history page
      boundedSnapshot.ts    boundedSnapshotProjection: restores a compact snapshot's turn items
      threadFind.ts         find within one thread
      shell.ts              project and thread shells, shell snapshot and stream items
      stream.ts             thread stream items, RPC inputs and outputs, launch
      commands.ts           OrchestrationV2Command union (commands/*.ts by family)
    server.ts               ServerConfig (providers typed, settings loose), config/lifecycle stream events
    provider.ts             provider snapshot, models, auth status
    vcs.ts                  refs, status, worktree inputs/results
    terminal.ts             open/attach/write/events
  wire/
    envelope.ts             zod schemas + types for every envelope (Request, Ack, Chunk, Exit, ...)
    exit.ts                 ExitEncoded → { ok, value } | { ok:false, failure } normalisation
  transport/
    http.ts                 HttpTransport: fetch wrapper, auth header, extra headers, error mapping, JSON decode
    socket.ts               SocketTransport: WebSocket lifecycle, reconnect, send/receive
    keepalive.ts            Ping/Pong liveness for one open socket
    socketClose.ts          classifies a close event: credential rejection (fatal) or drop (retry)
    rpcConnection.ts        RpcConnection: request ids, correlation, Chunk→AsyncIterable with Ack, Interrupt
  rpc/
    registry.ts             RpcMethodTable: method name → { payload, success, stream } zod schemas + scope
    methods/*.ts            one file per family (orchestration, server, vcs, projects, terminal, authAccess)
    client.ts               RpcClient: typed call/stream over RpcConnection using the registry
  auth/
    credentialStore.ts      CredentialStore seam + memoryCredentialStore + fileCredentialStore
    authClient.ts           AuthClient: exchange, ticket, session state, pairing links, clients, scopes
    scopes.ts               scope constants, hasScope, grantedScopes
  api/                      facades composed by T3Client
    server.ts               getConfig, probe, watchConfig, watchLifecycle
    projects.ts             list, get, snapshot, create, update, delete, ensure, ensureScratch, createNew, files
    threads.ts              list, get, detail, projection, historyPage, transcript, create, ensure, launch, update, archive, delete, startTurn, interrupt, stop, respond*, watch
    threadCommands.ts       command builders
    threadTurnStart.ts      startTurn: modes, message.dispatch, delivery
    turns.ts                TurnHandle: events(), completion, derived from a thread watch
    turnAdoption.ts         which run a message produced
    threadWatch.ts          resumable live view
    threadTracker.ts        projection state plus derived items
    threadProjection.ts     applyThreadEvent (upsert rules)
    threadDerived.ts        pendingRequests, runOutcome, activeRun, threadPhase
    shell.ts                snapshot, archivedSnapshot, watch, watchArchived
    vcs.ts                  listRefs, status, createWorktree, removeWorktree, createRef, switchRef
    terminal.ts             open, attach, write, resize, close
    dispatch.ts             CommandDispatcher: validate and send OrchestrationV2Command
  internal/
    asyncIterable.ts        channel/queue helpers, withAbort, merge
    ids.ts                  newId (uuid v4 via node:crypto)
    clock.ts                now() ISO, injectable for tests
    backoff.ts              exponential backoff policy
    logger.ts               optional logger seam (no-op default)
    redact.ts               redactSecrets: strips credential-shaped values before they ride on an error
```

Test layout:

```text
src/**/*.test.ts              unit tests next to the module (fake fetch, fake ws server)
test/support/                 FakeT3Server: a `ws` server speaking the envelope protocol + fake HTTP routes; V2 fixture builders
test/fixtures/                payloads captured from the pinned server
test/live/                    gated by T3_LIVE=1, T3_LIVE_URL, T3_LIVE_TOKEN; runs against a real server
```

## Interfaces

### errors.ts

One error strategy: every failure the library raises is a `T3Error` subclass
with a stable `code` string, and never a bare `Error` or a rejected `unknown`.

```ts
export abstract class T3Error extends Error { readonly code: string; readonly cause?: unknown }
export class T3HttpError extends T3Error        // code: "http"; status, body (secrets redacted), tag?, reason?, traceId?
export class T3AuthError extends T3HttpError    // code: "auth_invalid" | "insufficient_scope"; requiredScope?
export class T3NotFoundError extends T3HttpError // code: "not_found"; reason
export class T3RpcError extends T3Error         // code: "rpc_failed"; tag, record: RpcErrorRecord (typed by _tag), is(tag) narrows record
export class T3RpcDefectError extends T3Error   // code: "rpc_defect"; defect (string or unknown)
export class T3ConnectionError extends T3Error  // code: "connection"; reason: "closed" | "open_failed" | "ping_timeout" | "protocol"
export class T3DecodeError extends T3Error      // code: "decode"; path, issues (zod issues), raw (secrets redacted)
export class T3PreconditionError extends T3Error // code: "precondition"; caller misuse detected locally
export class T3InterruptedError extends T3Error // code: "interrupted"; stream/call cancelled by us
export class T3TimeoutError extends T3Error     // code: "timeout"
```

`body` and `raw` pass through `redactSecrets` (`internal/redact.ts`): string
values whose key looks like a credential (`token`, `credential`, `secret`,
`authorization`, `password`, `ticket`) become `"[redacted]"`, so an error that
carries a badly shaped `/oauth/token` response never carries the token.

### schemas/

Conventions:

- Every object is `z.looseObject({...})` so unknown keys pass through.
- Branded ids: `ThreadId`, `ProjectId`, `CommandId`, `MessageId`, `RunId`,
  `NodeId`, `TurnItemId`, `RuntimeRequestId`, `EventId`, `AuthSessionId`,
  `ProviderInstanceId` and the rest are `z.string().min(1).brand<"ThreadId">()`
  etc. Constructors `threadId(s)` brand a trusted string without validation
  cost.
- Growing literal sets use `forwardCompatibleLiteral([...])`, which yields the
  known union plus a `string` fallback typed as `(typeof known)[number] | (string & {})`.
- Discriminated unions that grow (`OrchestrationV2DomainEvent`,
  `OrchestrationV2TurnItem`, stream items, RPC error records) decode through
  `taggedUnionWithUnknown("type", members)`: an unrecognised member decodes as
  `{ unknown: true, raw }` rather than failing; a recognised member whose
  fields do not match still fails, so drift on a known member is visible.
  Arrays of such unions in a projection (`turnItems`, `plans`,
  `visibleTurnItems`) drop unknown members, as upstream does.
- Unions a caller sends (`OrchestrationV2Command`, `ProjectMutation`,
  workspace strategies, `ProjectIconOverride`) are strict discriminated
  unions, so a bad command fails locally with a `T3PreconditionError`.
- `unknown` appears only where the server itself leaves a value opaque (raw
  provider data, `Schema.Defect()` causes, dynamic tool input) or at the raw
  transport boundary before a method's schema applies. `any` is a lint error.
- Each schema file exports the zod schema and `type X = z.infer<typeof X>`
  with the same name, mirroring the contracts package naming
  (`OrchestrationV2AppThread`, `OrchestrationV2Run`, ...) so a reader can diff
  against `packages/contracts/src`.
- Input schemas are used by the library to validate what the caller passes
  before sending. Output schemas decode server responses; a decode failure
  raises `T3DecodeError` for unary calls and is delivered as an
  `{ kind: "decode-error" }` item for streams (the stream continues).

### wire/envelope.ts

```ts
export type RequestId = string;
export interface RequestEnvelope {
  _tag: "Request";
  id: RequestId;
  tag: string;
  payload: unknown;
  headers: [];
}
export interface AckEnvelope {
  _tag: "Ack";
  requestId: RequestId;
}
export interface InterruptEnvelope {
  _tag: "Interrupt";
  requestId: RequestId;
}
export interface PingEnvelope {
  _tag: "Ping";
}
export type ClientEnvelope =
  RequestEnvelope | AckEnvelope | InterruptEnvelope | PingEnvelope | { _tag: "Eof" };
export type ServerEnvelope = ChunkEnvelope | ExitEnvelope | DefectEnvelope | PongEnvelope; // zod-validated
export const ServerEnvelope: z.ZodType<ServerEnvelope>;
export function decodeServerFrame(text: string): ServerEnvelope[]; // handles arrays; throws T3ConnectionError("protocol")
export function encodeClientEnvelope(e: ClientEnvelope): string;
```

`decodeServerFrame` skips an envelope whose `_tag` it does not know (a newer
server) and throws `protocol` for invalid JSON or for a known tag whose shape
is wrong, so the transport fails everything in flight instead of leaving one
request waiting forever. A `Success` exit without a `value` key is valid
(`Stream<void>`).

### wire/exit.ts

```ts
export type RpcExitOutcome =
  | { kind: "success"; value: unknown }
  | { kind: "fail"; error: { _tag: string } & Record<string, unknown> }
  | { kind: "die"; defect: unknown }
  | { kind: "interrupt" };
export function normalizeExit(exit: ExitEncoded): RpcExitOutcome; // first cause wins, Fail preferred over Die
export function exitToError(outcome: RpcExitOutcome, method: string): T3Error;
```

### transport/http.ts

```ts
export interface HttpTransportOptions {
  baseUrl: string;
  fetch?: typeof fetch;
  credentials: CredentialStore;
  userAgent?: string;
}
export interface HttpRequest<T> {
  method: "GET" | "POST" | "PUT" | "DELETE";
  path: string;
  query?: Record<string, string | number | undefined>;
  body?: unknown | URLSearchParams;
  auth?: "required" | "optional" | "none";
  headers?: Record<string, string>; // the orchestration routes add the protocol header
  decode: z.ZodType<T> | "empty";
  signal?: AbortSignal;
}
export class HttpTransport {
  request<T>(req: HttpRequest<T>): Promise<T>;
}
```

`request` attaches `authorization: Bearer` when a token is present, maps
non-2xx to `T3HttpError` subclasses using the tagged error body when present,
decodes 2xx JSON through the schema, and treats 204 or an empty body as
`undefined` when `decode` is `"empty"`.

### transport/socket.ts

```ts
export type SocketState = "idle" | "connecting" | "open" | "closed";
export interface SocketTransportOptions {
  url: () => Promise<URL>; // resolves auth on every (re)connect: ticket query or bearer header
  headers?: () => Promise<Record<string, string>>;
  webSocket?: WebSocketConstructor; // defaults to globalThis.WebSocket
  pingIntervalMs?: number;
  missedPongLimit?: number; // 5000 / 3, matching the server's client
  backoff?: BackoffPolicy;
  openTimeoutMs?: number; // absent: no open timeout
  logger?: Logger;
}
export class SocketTransport {
  readonly state: SocketState;
  connect(signal?: AbortSignal): Promise<void>; // idempotent; resolves when open
  send(text: string): void; // throws T3ConnectionError when not open
  onMessage(handler: (text: string) => void): () => void;
  onStateChange(handler: (state: SocketState, error?: T3ConnectionError) => void): () => void;
  reconnect(): void; // drops the socket and connects again at once; in-flight work fails with "closed"
  close(): Promise<void>; // stops reconnecting
}
```

The default heartbeat sends a ping every five seconds and drops the socket
when three pongs remain unanswered at the next interval. Default reconnect
backoff is 500 ms × 1.5, capped at 5 s, with jitter 0.2. `T3ClientOptions`
passes `backoff`, `pingIntervalMs`, and `missedPongLimit` to the transport.
`BackoffPolicy` is exported and has `initialMs`, `factor`, `maxMs`, and an
optional `jitter` fraction (default 0 for a supplied policy).

`openTimeoutMs` optionally bounds each WebSocket handshake, starting after
URL and header resolution. A stalled handshake is abandoned, its later events
are ignored, and the transport retries after backoff with reason `open_failed`.
An absent option means no open timeout. The open timer is cleared on open,
close, credential reconnect, or abandonment.

Transient failures, including refused or reset connections and non-4xx
upgrade failures, retry until `close()`. A 4xx upgrade, a 1008 close, or a
`T3AuthError` resolving URL or headers reports `open_failed` and closes the
transport permanently. Only the `ws` package exposes the upgrade status; the global
`WebSocket` reports a rejected upgrade as an ordinary drop, so `T3Client`
validates the token over HTTP inside `headers()` in bearer-header mode and
throws `T3AuthError`, which the transport treats as fatal.

The server compresses socket messages (permessage-deflate). The global
`WebSocket` of some Node builds (undici 7.24, in Node 25.9) closes the socket
with 1006 when one message inflates past 4 MiB, and later undici builds have
no such cap by default. A shell or thread snapshot can be larger than that, so
a caller that reads large snapshots on such a build passes `webSocket` from
the `ws` package, whose limit is 100 MiB. Abort listeners
that `connect` adds to a caller's signal are removed when the wait settles.

### transport/rpc-connection.ts

```ts
export interface RpcStreamOptions {
  signal?: AbortSignal;
  highWaterMark?: number;
}
export class RpcConnection {
  readonly state: SocketState;
  constructor(socket: SocketTransport, options?: { idGenerator?: () => string; logger?: Logger });
  call(tag: string, payload: unknown, signal?: AbortSignal): Promise<unknown>;
  stream(tag: string, payload: unknown, options?: RpcStreamOptions): AsyncIterable<unknown>;
  close(): Promise<void>;
}
```

Rules: one `Request` per call; `Chunk` values are queued and an `Ack` is sent
after each chunk is consumed by the iterator (backpressure); `Exit` resolves
or rejects; an `Interrupt` is sent when the consumer returns early or the
signal aborts; a socket close rejects every in-flight call with
`T3ConnectionError("closed")` and ends every stream with the same error
(streams are not transparently resumed here; the facades resume using
`afterSequence`). `Defect` fails everything in flight. Every abort listener
is removed when its call settles or its stream ends, fails, or is
interrupted, so a long-lived shared signal does not accumulate closures.

### rpc/registry.ts and rpc/client.ts

```ts
export interface RpcMethodSpec<P, S> { payload: z.ZodType<P>; success: z.ZodType<S>; stream: boolean; scope: AuthEnvironmentScope;
  payloadScopes?(payload: P): readonly AuthEnvironmentScope[] }   // further scopes a particular payload needs
export const rpcMethods: { [K in RpcMethodName]: RpcMethodSpec<…> }   // assembled from rpc/methods/*.ts
export type RpcMethodName = keyof typeof rpcMethods
export type RpcPayload<M> / RpcSuccess<M>

export class RpcClient {
  call<M extends UnaryMethod>(method: M, payload: RpcPayload<M>, signal?: AbortSignal): Promise<RpcSuccess<M>>
  stream<M extends StreamMethod>(method: M, payload: RpcPayload<M>, options?: RpcStreamOptions): AsyncIterable<StreamItem<RpcSuccess<M>>>
  callRaw(tag: string, payload: unknown, signal?: AbortSignal): Promise<unknown>      // any method, no schemas
  streamRaw(tag: string, payload: unknown, options?: RpcStreamOptions): AsyncIterable<unknown>
}
export type StreamItem<T> = { kind: "item"; value: T } | { kind: "decode-error"; error: T3DecodeError }
```

Registry coverage for this version, all typed: the fifteen orchestration
methods; `projects.mutate`; `mcpApps.callTool`, `mcpApps.toolInfo`,
`mcpApps.readResource`, `mcpApps.updateModelContext`; `server.probe`, `server.getConfig`,
`server.getSettings`, `server.refreshProviders`, `subscribeServerConfig`,
`subscribeServerLifecycle`, `subscribeAuthAccess`; `vcs.listRefs`,
`vcs.refreshStatus`, `vcs.createWorktree`, `vcs.removeWorktree`,
`vcs.createRef`, `vcs.switchRef`, `subscribeVcsStatus`,
`subscribeWorktreeSetup`, `worktreeSetup.cancel`; `projects.listEntries`,
`projects.readFile`, `projects.writeFile`, `projects.searchEntries`,
`projects.searchContents`, `projects.ensureScratch`, `projects.createNew`;
`terminal.open`, `terminal.attach`, `terminal.write`, `terminal.resize`,
`terminal.close`, `subscribeTerminalEvents`. Everything else goes through
`callRaw` and `streamRaw` until it is added; adding a method is one entry in
a family file. Each entry carries the scope the server checks: file reads
need `filesystem:read`, file writes `filesystem:write`, worktree and ref
changes `source-control:write`, terminal event streams `terminal:read`, MCP
app tool calls and model context `orchestration:operate`.

Before sending, `RpcClient` checks the credential's scopes when known and
raises `T3AuthError("insufficient_scope")` locally so a workflow fails fast
with the scope name instead of a generic server error. A method whose scope
depends on the payload declares `payloadScopes`, checked once the payload is
valid.

### auth/

```ts
export interface StoredCredentials {
  accessToken?: string;
  scopes?: AuthGrantedScope[]; // KnownOr<AuthEnvironmentScope>: a newer server may grant a scope this client does not know
  expiresAt?: string;
  sessionMethod?: ServerAuthSessionMethod;
}
export interface CredentialStore {
  load(): Promise<StoredCredentials>;
  save(c: StoredCredentials): Promise<void>;
  clear(): Promise<void>;
}
export function memoryCredentialStore(initial?: StoredCredentials): CredentialStore;
export function fileCredentialStore(path: string): CredentialStore; // JSON file, 0600

export class AuthClient {
  descriptor(signal?): Promise<ExecutionEnvironmentDescriptor>;
  sessionState(signal?): Promise<AuthSessionState>; // uses the stored token when present
  exchangePairingToken(
    pairingToken: string,
    options?: {
      scopes?: AuthEnvironmentScope[];
      clientLabel?: string;
      clientDeviceType?: AuthClientMetadataDeviceType;
      clientOs?: string;
    },
  ): Promise<AuthAccessTokenResult>; // saves to the store
  setAccessToken(token: string): Promise<AuthSessionState>; // validates via /api/auth/session, saves
  clearCredentials(): Promise<void>;
  websocketTicket(signal?): Promise<AuthWebSocketTicketResult>;
  createPairingCredential(
    input: AuthCreatePairingCredentialInput,
  ): Promise<AuthPairingCredentialResult>;
  listPairingLinks(): Promise<AuthPairingLink[]>;
  revokePairingLink(id: string): Promise<boolean>;
  listClients(): Promise<AuthClientSession[]>;
  revokeClient(sessionId: AuthSessionId): Promise<boolean>;
  revokeOtherClients(): Promise<number>;
  watchAccess(options?): AsyncIterable<AuthAccessStreamEvent>; // subscribeAuthAccess over RPC
  hasScope(scope: AuthEnvironmentScope): Promise<boolean>;
  ensureScopes(required: AuthEnvironmentScope[]): Promise<void>; // throws T3AuthError with the missing scope
  scopesSync(): AuthGrantedScope[] | undefined; // from the last credential loaded or saved; no store round trip
  readonly credentialsVersion: number; // increments on every save or clear that changes the credential
  onCredentialsChange(handler: () => void): () => void;
}
```

`AuthClient` is the only module that reads or writes the credential store.
The HTTP and socket transports ask it for the current token through a
function, never the store directly. `AuthEnvironmentScope` stays a strict
enum for what a caller asks for (pairing credential scopes, exchange scopes,
`ensureScopes`); everything the server reports (session state, token
exchange, pairing links, client sessions) decodes as `AuthGrantedScope`, read
from `permissions` when the server sends it and from `scopes` otherwise.
`RpcClient` reads `scopesSync()` for its local scope check, and `T3Client`
calls `SocketTransport.reconnect()` on every credential change so the open
socket authenticates as the new session.

### api/ facades

Facades hold no state beyond references to the transports. They validate
inputs with the schemas, fill server-required bookkeeping fields
(`commandId`, `messageId`, `createdBy`, `creationSource`) so callers never
hand-build a command, and translate stream items into domain items.

```ts
export class ProjectsApi {
  list(): Promise<OrchestrationProjectShell[]>                    // from the shell snapshot
  snapshot(): Promise<ProjectSnapshot>                            // GET /api/projects: full records
  get(projectId): Promise<OrchestrationProjectShell | undefined>
  findByWorkspaceRoot(workspaceRoot: string): Promise<OrchestrationProjectShell | undefined>  // normalises trailing slashes
  create(input: { projectId?; title; workspaceRoot; createWorkspaceRootIfMissing?; defaultModelSelection?; scripts? }): Promise<Project>
  ensure(input: { workspaceRoot; title; createWorkspaceRootIfMissing? }): Promise<OrchestrationProjectShell>
  update(projectId, patch: ProjectUpdatePayload): Promise<Project>
  delete(projectId, options?: { force?: boolean }): Promise<void>  // idempotent: not found resolves
  ensureScratch(): Promise<ProjectEnsureScratchResult>             // server finds or creates the Scratch project
  createNew(input: { name: string }): Promise<ProjectCreateNewResult>  // server makes the folder, first commit, and project
  files: { list, read, write, searchEntries, searchContents }      // thin typed RPC wrappers
}

export class ThreadsApi {
  list(options?: { projectId?: ProjectId; includeArchived?: boolean }): Promise<OrchestrationV2ThreadShell[]>  // archived ones from the RPC archived shell
  get(threadId): Promise<OrchestrationV2ThreadShell | undefined>  // active first, then the archived shell
  detail(threadId): Promise<OrchestrationV2ThreadDetailSnapshot>  // HTTP, the full projection; T3NotFoundError
  projection(threadId): Promise<OrchestrationV2ThreadProjection>  // RPC, bounded timeline window
  historyPage(threadId, cursor, options?: { throughEntryId?; view?: "conversation" | "activity" }): Promise<OrchestrationV2ThreadHistoryPage>
  transcript(threadId): Promise<OrchestrationV2ThreadTranscript>  // HTTP, the visible timeline; T3NotFoundError, T3HttpError thread_transcript_too_large
  create(input: ThreadCreateInput): Promise<OrchestrationV2ThreadShell>   // caller may pass threadId; else generated
  ensure(input: ThreadCreateInput & { threadId: ThreadId }): Promise<OrchestrationV2ThreadShell>   // exists → return as is
  launch(input: ThreadLaunchInput): Promise<OrchestrationV2ThreadLaunchResult>  // thread + workspace + optional first message
  update(threadId, patch: ThreadMetadataUpdatePayload): Promise<void>
  archive / unarchive / settle / unsettle / delete (threadId): Promise<void>  // archive and delete idempotent
  setRuntimeMode(threadId, mode) / setInteractionMode(threadId, mode) / setModelSelection(threadId, selection)
  startTurn(input: StartTurnInput): Promise<TurnHandle>
  interrupt(threadId, runId?, options?: { reason?; holdQueue? }): Promise<void>  // active run when runId omitted; no-op when idle
  stop(threadId): Promise<void>                                                // interrupt + holdQueue
  respondToApproval(input: { threadId; requestId; decision: ProviderApprovalDecision }): Promise<void>
  respondToUserInput(input: { threadId; requestId; answers: Record<string, unknown>; attachmentsByQuestionId? }): Promise<void>
  dismissUserInput(input: { threadId; requestId }): Promise<void>
  pendingRequests(threadId): Promise<PendingRequest[]>                         // pending runtime requests joined with their turn items
  watch(threadId, options?: WatchOptions): AsyncIterable<ThreadWatchItem>       // resumable live view
  phase(thread: OrchestrationV2ThreadShell): ThreadPhase                        // pure; "waiting_for_approval" | "waiting_for_input" | "failed" | "starting" | "running" | "completed" | "idle"
  dispatch(command: OrchestrationV2Command): Promise<DispatchResult>
}

export interface StartTurnInput { threadId: ThreadId; text: string; attachments?: ChatAttachment[]; context?: OrchestrationMessageContext;
  modelSelection?: ModelSelection; runtimeMode?: RuntimeMode; interactionMode?: ProviderInteractionMode; titleSeed?: string;
  delivery?: "auto" | "steer" | "restart" | "queue" | "start"; origin?: CreationOrigin; signal?: AbortSignal }

export interface TurnHandle {
  readonly threadId: ThreadId
  readonly messageId: MessageId
  readonly commandId: CommandId
  readonly sequence: number                          // dispatch receipt
  readonly runId: RunId | undefined                  // once the server has linked the message to its run
  events(): AsyncIterable<ThreadWatchItem>           // from first iteration until the run settles; nothing is buffered before that
  readonly completion: Promise<TurnOutcome>          // resolves when the run that took this message reaches a terminal state
  interrupt(): Promise<void>
}
export type TurnOutcome = { state: "completed" | "interrupted" | "failed" | "cancelled" | "rolled_back"; runId: RunId; run: OrchestrationV2Run;
  assistantMessage?: OrchestrationV2ConversationMessage; error?: string; projection: OrchestrationV2ThreadProjection }

export type ThreadWatchItem =
  | { kind: "snapshot"; snapshot: OrchestrationV2ThreadDetailSnapshot }
  | { kind: "synchronized" }
  | { kind: "event"; sequence: number; event: OrchestrationV2DomainEvent }
  | { kind: "assistant-delta"; runId; itemId; messageId; text; delta; streaming }   // text so far; delta is what the update appended
  | { kind: "approval-requested"; requestId; request: OrchestrationV2RuntimeRequest; item? }
  | { kind: "user-input-requested"; requestId; request; item?; questions: OrchestrationV2UserInputQuestion[] }
  | { kind: "request-resolved"; requestId }
  | { kind: "turn-settled"; outcome: TurnOutcome }
  | { kind: "decode-error"; error: T3DecodeError }
  | { kind: "reconnected"; afterSequence: number }
```

`startTurn` sets the thread's runtime and interaction modes first when the
caller names them, then dispatches `message.dispatch`. `delivery` chooses
how a busy thread takes the message: `auto` (the default), `steer`, and
`restart` ask for `start_immediately` with that `deliveryIntent`, so the
server resolves the mode against its own state; `queue` asks for
`queue_after_active`; `start` asks for `start_immediately` without an
intent.

`watch` subscribes with `orchestration.subscribeThread`; on socket loss it
resubscribes with `afterSequence` set to the last sequence seen and emits
`reconnected`. The snapshot frame seeds the derived items (pending requests)
so a consumer that joins late sees the current state first. Events whose
sequence is at or below the cursor are replay overlap and are skipped. The
tracker applies every known event to its projection and announces
`turn-settled` once per run when the run reaches a terminal status.

Both thread and shell watches wait through transient first-connection failures
and retry subscriptions that disconnect before delivering an item, without an
attempt limit. Each connection attempt uses the transport's backoff. A watch
keeps its last cursor across the gap and filters replay overlap. Credential
rejections end the watch with the connection error; caller abort ends it quietly,
and `client.close()` ends it with a closed connection error. The transport's
connecting state determines whether a connection failure triggers a retry,
rather than its reason or the number of empty subscriptions. A connection
error raised while the socket is open, including an HTTP detail failure while
seeding a resumed thread watch, ends the watch with that error.

The server links a message to its run: a new run's `userMessageId` names the
message that started it, and the message record's `runId` names the run that
took it, also when the message was steered into a run that was already
active. A `TurnHandle` follows the run either link names and settles when
that run reaches a terminal status; `assistantMessage` is the last assistant
message of that run, and `error` the failure recorded by the run's `error`
turn item. A message steered into an active run therefore settles with that
run's id, together with the message that started it.

```ts
export class ShellApi {
  snapshot(): Promise<OrchestrationV2ShellSnapshot>; // HTTP: projects, threads, archivedThreads
  archivedSnapshot(): Promise<OrchestrationV2ArchivedShellSnapshot>; // RPC
  watch(options?): AsyncIterable<ShellWatchItem>; // resumable like threads
  watchArchived(options?): AsyncIterable<ArchivedShellWatchItem>;
}
export class ServerApi {
  probe();
  getConfig();
  getSettings();
  refreshProviders(input?);
  watchConfig();
  watchLifecycle();
  environment();
}
export class VcsApi {
  listRefs;
  status;
  createWorktree;
  removeWorktree;
  createRef;
  switchRef;
  watchStatus;
}
export class TerminalApi {
  open;
  attach(stream);
  write;
  resize;
  close;
}
```

### client.ts

```ts
export interface T3ClientOptions {
  baseUrl: string;
  credentials?: CredentialStore; // default memoryCredentialStore()
  accessToken?: string; // convenience: seeds the store
  clientLabel?: string;
  clientAppVersion?: string; // sent on the ws upgrade and token exchange
  fetch?: typeof fetch;
  webSocket?: WebSocketConstructor;
  logger?: Logger;
  backoff?: BackoffPolicy; // default 500 ms × 1.5, cap 5 s, jitter 0.2
  pingIntervalMs?: number; // default 5000
  missedPongLimit?: number; // default 3
  openTimeoutMs?: number; // absent: no open timeout
  socketAuth?: "ticket" | "bearer-header"; // default "ticket" (works with every WebSocket implementation)
}
export class T3Client {
  static create(options: T3ClientOptions): T3Client;
  readonly auth: AuthClient;
  readonly server: ServerApi;
  readonly projects: ProjectsApi;
  readonly threads: ThreadsApi;
  readonly shell: ShellApi;
  readonly vcs: VcsApi;
  readonly terminal: TerminalApi;
  readonly rpc: RpcClient;
  connect(signal?): Promise<void>; // optional eager connect
  close(): Promise<void>;
}
```

The socket URL carries `orchestrationProtocol=2` and `clientSurface=cli`.

## Idempotent ensure operations

| Operation                           | Key                                 | Behaviour                                                                                             |
| ----------------------------------- | ----------------------------------- | ----------------------------------------------------------------------------------------------------- |
| `projects.ensure`                   | normalised `workspaceRoot`          | find in shell snapshot; create with a fresh id when absent; update title only if given and different  |
| `projects.ensureScratch`            | `ServerConfig.scratchWorkspaceRoot` | the server finds the Scratch project or creates it; racing callers get the same project               |
| `threads.ensure`                    | caller-supplied `threadId`          | return existing shell thread (active or archived); create otherwise; never mutates an existing thread |
| `threads.launch`                    | `threadId` + `reuseExistingThread`  | the server returns the existing thread's projection with `resumed: true`                              |
| `auth.setAccessToken`               | token                               | validate then store; same token stored twice is a no-op                                               |
| `projects.delete`, `threads.delete` | id                                  | absent resource resolves without error                                                                |

Command ids are generated per dispatch, never reused, because the server
treats a command id as an attempt id rather than an idempotency key.

## Decisions worth recording

1. **Reimplement the wire instead of depending on Effect.** Verified: the
   envelope protocol is small and stable (documented in Effect's
   `RpcMessage`), the server uses plain JSON serialization, and both auth
   modes work with Node's built-in `WebSocket`. Cost: schemas are mirrored by
   hand and must be kept in step with each server release. Mitigation: file
   names and schema names mirror `packages/contracts/src`, and a live test
   suite runs against the release.
2. **zod 4 for schemas.** Loose objects and cheap brand types match the
   forward-compatibility rule; the consumer project is not on Effect.
3. **Commands go over the socket only.** The server has no HTTP dispatch
   route for protocol 2; the socket returns the typed
   `OrchestrationV2DispatchCommandError`. HTTP serves snapshot reads and
   project mutations.
4. **Ticket auth by default on the socket.** Bearer headers on the upgrade
   need a non-standard WebSocket option; tickets work everywhere and cost one
   HTTP round trip per (re)connect.
5. **A turn is a run.** The library keeps `startTurn` and `TurnHandle` as
   its vocabulary for "send a message and follow its execution" and carries
   the server's `runId`, so a workflow does not have to learn the server's
   run and attempt model to wait for an answer.

## Out of scope for this version

Pull requests, previews, devices, cloud relay, DPoP, desktop bootstrap,
attachment upload signing, source-control clone flows, scheduled tasks, MCP
OAuth, forks and merge-backs, delegated tasks, and settings mutation. They
stay reachable through `rpc.callRaw`, `rpc.streamRaw`, and
`threads.dispatch` with the full `OrchestrationV2Command` union.
