# T3 Code client: technical design

`@wyrd-company/t3code-client` is a TypeScript library that lets a Node program
drive a T3 Code server the way the T3 web and desktop clients do: create
projects and threads, start turns, watch a thread live, answer approvals and
questions, and manage the server's auth control plane. It is the foundation
for software-delivery workflows
that dispatch, manage, and monitor agent sessions while a person can still
open the same session in a normal T3 client.

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

## Wire facts (verified against T3 Code 0.0.42, upstream release)

HTTP, all under one base URL:

| Method and path                            | Auth                 | Notes                                                             |
| ------------------------------------------ | -------------------- | ----------------------------------------------------------------- |
| `GET /.well-known/t3/environment`          | none                 | `ExecutionEnvironmentDescriptor`                                  |
| `GET /api/auth/session`                    | optional bearer      | `AuthSessionState`; `authenticated:false` without a credential    |
| `POST /oauth/token`                        | none                 | form-encoded token exchange; pairing token is single use          |
| `POST /api/auth/websocket-ticket`          | bearer               | `{ticket, expiresAt}`; ticket lives about five minutes            |
| `POST /api/auth/pairing-token`             | bearer, access:write | body `{label?, scopes?}`; the credential is returned once         |
| `GET /api/auth/pairing-links`              | bearer, access:read  |                                                                   |
| `POST /api/auth/pairing-links/revoke`      | bearer, access:write | `{id}` → `{revoked}`                                              |
| `GET /api/auth/clients`                    | bearer, access:read  | `AuthClientSession[]`                                             |
| `POST /api/auth/clients/revoke`            | bearer, access:write | `{sessionId}` → `{revoked}`                                       |
| `POST /api/auth/clients/revoke-others`     | bearer, access:write | `{revokedCount}`                                                  |
| `GET /api/orchestration/snapshot`          | bearer, orch:read    | full `OrchestrationReadModel`                                     |
| `GET /api/orchestration/shell`             | bearer, orch:read    | `OrchestrationShellSnapshot`                                      |
| `GET /api/orchestration/threads/:threadId` | bearer, orch:read    | query `turnLimit`, `beforeCursor`; 404 `thread_not_found`         |
| `POST /api/orchestration/dispatch`         | bearer, orch:operate | `ClientOrchestrationCommand` → `{sequence}`; invariant errors 500 |
| `POST /api/pull-requests/diff`             | bearer               | out of scope for this version                                     |

HTTP errors are JSON tagged records: `EnvironmentRequestInvalidError` (400),
`EnvironmentAuthInvalidError` (401), `EnvironmentScopeRequiredError` and
`EnvironmentOperationForbiddenError` (403), `EnvironmentResourceNotFoundError`
(404), `EnvironmentInternalError` (500). Each carries `code`, `reason` and
`traceId`.

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
        {"_tag":"Fail","error":{"_tag":"OrchestrationDispatchCommandError","message":"…"}}
      | {"_tag":"Die","defect":"Missing key\n  at [\"fromTurnCount\"]"}
      | {"_tag":"Interrupt","fiberId":797} ]}}
  {"_tag":"Defect","defect":...}             connection-level failure
  {"_tag":"Pong"}
```

`headers` is required on `Request`; omitting it makes the server close the
socket without a reason. A stream ends with an `Exit` (an `Interrupt` cause
after the client cancels). A payload the server cannot decode surfaces as a
`Die` with a string defect, so the client validates payloads before sending
to give a better error.

The full method list is `WS_METHODS` plus `ORCHESTRATION_WS_METHODS` in the
contracts package; the scope each method needs is in
`apps/server/src/auth/RpcAuthorization.ts`.

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
const project = await client.projects.ensure({ workspaceRoot: "/srv/repo", title: "repo" });
const thread = await client.threads.ensure({
  threadId: stableThreadId,
  projectId: project.id,
  title: "Review PR 42",
  modelSelection: { instanceId: "codex", model: "gpt-5.6-luna" },
  runtimeMode: "auto",
});

// Run a turn and wait for it to settle
const turn = await client.threads.startTurn({ threadId: thread.id, text: "Review the diff." });
for await (const item of turn.events()) {
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
const outcome = await turn.completion; // { state: "completed" | "interrupted" | "error", assistantText, ... }

// Watch everything
for await (const item of client.shell.watch({ signal })) {
  /* project-upserted, thread-upserted, ... */
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
    environment.ts          ExecutionEnvironmentDescriptor
    httpErrors.ts           Environment*Error records
    orchestration/
      model.ts              ModelSelection, RuntimeMode, InteractionMode, attachments
      readModel.ts          OrchestrationProject, OrchestrationThread, ReadModel, ThreadDetailSnapshot
      shell.ts              shell snapshot, shell stream items, subscribe inputs
      commands.ts           ClientOrchestrationCommand union and each command
      events.ts             OrchestrationEvent union, payloads, unknown-event variant
      stream.ts             thread stream items, DispatchResult, rpc inputs/outputs
      activities.ts         typed activity payloads for approval/user-input requests
    server.ts               ServerConfig (providers typed, settings loose), config/lifecycle stream events
    provider.ts             provider snapshot, models, auth status
    vcs.ts                  refs, status, worktree inputs/results
    projects.ts             file entries, read/write/search
    terminal.ts             open/attach/write/events
  wire/
    envelope.ts             zod schemas + types for every envelope (Request, Ack, Chunk, Exit, ...)
    exit.ts                 ExitEncoded → { ok, value } | { ok:false, failure } normalisation
  transport/
    http.ts                 HttpTransport: fetch wrapper, auth header, error mapping, JSON decode
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
    scopes.ts               scope constants, hasScope, scopeForRpcMethod
  api/                      facades composed by T3Client
    server.ts               getConfig, probe, watchConfig, watchLifecycle
    projects.ts             list, get, create, update, delete, ensure, files (read/write/search/list)
    threads.ts              list, get, create, ensure, update, archive, delete, startTurn, interrupt, stop, respond*, watch
    turns.ts                TurnHandle: events(), completion, derived from a thread watch
    shell.ts                snapshot, watch (resumable)
    vcs.ts                  listRefs, status, createWorktree, removeWorktree, createRef, switchRef
    terminal.ts             open, attach, write, resize, close
  internal/
    asyncIterable.ts        channel/queue helpers, withAbort, merge
    ids.ts                  newCommandId, newThreadId (uuid v4 via node:crypto)
    clock.ts                now() ISO, injectable for tests
    backoff.ts              exponential backoff policy
    logger.ts               optional logger seam (no-op default)
    redact.ts               redactSecrets: strips credential-shaped values before they ride on an error
```

Test layout:

```text
src/**/*.test.ts              unit tests next to the module (fake fetch, fake ws server)
test/support/                 FakeT3Server: a `ws` server speaking the envelope protocol + fake HTTP routes
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
export class T3RpcError extends T3Error         // code: "rpc_failed"; tag (server error _tag), detail (decoded error record)
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
- Branded ids: `ThreadId`, `ProjectId`, `CommandId`, `MessageId`, `TurnId`,
  `EventId`, `ApprovalRequestId`, `AuthSessionId`, `ProviderInstanceId` are
  `z.string().min(1).brand<"ThreadId">()` etc. Constructors `threadId(s)`
  brand a trusted string without validation cost.
- Growing literal sets use `forwardCompatibleLiteral([...])`, which yields the
  known union plus a `string` fallback typed as `(typeof known)[number] | (string & {})`.
- Discriminated unions that grow (`OrchestrationEvent`, stream items,
  activities) decode through `taggedUnionWithUnknown("type", members)`: an
  unrecognised member decodes as `{ type: string, ...raw, unknown: true }`
  rather than failing.
- Each schema file exports the zod schema and `type X = z.infer<typeof X>`
  with the same name, mirroring the contracts package naming so a reader can
  diff against `packages/contracts/src`.
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

Ping every five seconds; three missed pongs closes and reconnects. Reconnect
uses exponential backoff (500 ms, ×1.5, capped 5 s) until `close()`. A 401
on the upgrade is reported through `onStateChange` with reason
`"open_failed"` and stops reconnecting (the credential is wrong; retrying is
noise). Only the `ws` package exposes the upgrade status; the global
`WebSocket` reports a rejected upgrade as an ordinary drop, so `T3Client`
validates the token over HTTP inside `headers()` in bearer-header mode and
throws `T3AuthError`, which the transport treats as fatal. Abort listeners
that `connect` adds to a caller's signal are removed when the wait settles.

### transport/rpc-connection.ts

```ts
export interface RpcStreamOptions {
  signal?: AbortSignal;
  highWaterMark?: number;
}
export class RpcConnection {
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
export interface RpcMethodSpec<P, S> { payload: z.ZodType<P>; success: z.ZodType<S>; stream: boolean; scope: AuthEnvironmentScope }
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

Registry coverage for this version, all typed: the eight orchestration
methods; `server.probe`, `server.getConfig`, `server.getSettings`,
`server.refreshProviders`, `subscribeServerConfig`,
`subscribeServerLifecycle`, `subscribeAuthAccess`; `vcs.listRefs`,
`vcs.refreshStatus`, `vcs.createWorktree`, `vcs.removeWorktree`,
`vcs.createRef`, `vcs.switchRef`, `subscribeVcsStatus`,
`subscribeWorktreeSetup`, `worktreeSetup.cancel`; `projects.listEntries`,
`projects.readFile`, `projects.writeFile`, `projects.searchEntries`,
`projects.searchContents`; `terminal.open`, `terminal.attach`,
`terminal.write`, `terminal.resize`, `terminal.close`,
`subscribeTerminalEvents`. Everything else goes through `callRaw` and
`streamRaw` until it is added; adding a method is one entry in a family file.

Before sending, `RpcClient` checks the credential's scopes when known and
raises `T3AuthError("insufficient_scope")` locally so a workflow fails fast
with the scope name instead of a generic server error.

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
exchange, pairing links, client sessions) decodes as `AuthGrantedScope`.
`RpcClient` reads `scopesSync()` for its local scope check, and `T3Client`
calls `SocketTransport.reconnect()` on every credential change so the open
socket authenticates as the new session.

### api/ facades

Facades hold no state beyond references to the transports. They validate
inputs with the schemas, fill server-required bookkeeping fields
(`commandId`, `createdAt`, `messageId`) so callers never hand-build a
command, and translate stream items into domain items.

```ts
export class ProjectsApi {
  list(): Promise<OrchestrationProjectShell[]>                    // from the shell snapshot
  get(projectId): Promise<OrchestrationProjectShell | undefined>
  findByWorkspaceRoot(workspaceRoot: string): Promise<OrchestrationProjectShell | undefined>  // normalises trailing slashes
  create(input: { projectId?: ProjectId; title: string; workspaceRoot: string; createWorkspaceRootIfMissing?: boolean }): Promise<OrchestrationProjectShell>
  ensure(input: { workspaceRoot: string; title: string; createWorkspaceRootIfMissing?: boolean }): Promise<OrchestrationProjectShell>
  update(projectId, patch: ProjectMetaUpdate): Promise<void>
  delete(projectId, options?: { force?: boolean }): Promise<void>  // idempotent: not found resolves
  files: { list, read, write, searchEntries, searchContents }      // thin typed RPC wrappers
}

export class ThreadsApi {
  list(options?: { projectId?: ProjectId; includeArchived?: boolean }): Promise<OrchestrationThreadShell[]>
  get(threadId): Promise<OrchestrationThreadShell | undefined>
  detail(threadId, window?: { turnLimit?: number; beforeCursor?: string }): Promise<OrchestrationThreadDetailSnapshot>   // HTTP; T3NotFoundError
  create(input: ThreadCreateInput): Promise<OrchestrationThreadShell>          // caller may pass threadId; else generated
  ensure(input: ThreadCreateInput & { threadId: ThreadId }): Promise<OrchestrationThreadShell>   // exists → return as is
  update(threadId, patch: ThreadMetaUpdate): Promise<void>
  archive / unarchive / settle / delete (threadId): Promise<void>               // delete idempotent
  setRuntimeMode(threadId, mode) / setInteractionMode(threadId, mode)
  startTurn(input: StartTurnInput): Promise<TurnHandle>
  interrupt(threadId, turnId?): Promise<void>
  stopSession(threadId): Promise<void>
  respondToApproval(input: { threadId; requestId; decision: ProviderApprovalDecision }): Promise<void>
  respondToUserInput(input: { threadId; requestId; answers: Record<string, unknown> }): Promise<void>
  dismissUserInput(input: { threadId; requestId }): Promise<void>
  pendingRequests(threadId): Promise<PendingRequest[]>                         // derived from detail activities (decider rule)
  watch(threadId, options?: WatchOptions): AsyncIterable<ThreadWatchItem>       // resumable live view
  phase(thread: OrchestrationThreadShell): ThreadPhase                          // pure; "waiting_for_approval" | "waiting_for_input" | "failed" | "starting" | "running" | "completed" | "idle"
  dispatch(command: ClientOrchestrationCommand): Promise<DispatchResult>       // RPC when connected, else HTTP
}

export interface StartTurnInput { threadId: ThreadId; text: string; attachments?: ChatAttachment[]; modelSelection?: ModelSelection;
  runtimeMode?: RuntimeMode; interactionMode?: ProviderInteractionMode; titleSeed?: string; bootstrap?: ThreadTurnStartBootstrap; signal?: AbortSignal }

export interface TurnHandle {
  readonly threadId: ThreadId
  readonly messageId: MessageId
  readonly commandId: CommandId
  readonly sequence: number                          // dispatch receipt
  events(): AsyncIterable<ThreadWatchItem>           // from first iteration until the turn settles; nothing is buffered before that
  readonly completion: Promise<TurnOutcome>          // resolves when the turn that took this message reaches a terminal state
  interrupt(): Promise<void>
}
export type TurnOutcome = { state: "completed" | "interrupted" | "error"; turnId: TurnId | null; assistantMessage?: OrchestrationMessage; error?: string; thread: OrchestrationThread }

export type ThreadWatchItem =
  | { kind: "snapshot"; snapshot: OrchestrationThreadDetailSnapshot }
  | { kind: "synchronized" }
  | { kind: "event"; event: OrchestrationEvent }
  | { kind: "assistant-delta"; turnId; messageId; text }        // convenience projection of message deltas
  | { kind: "approval-requested"; requestId; activity; payload: ApprovalRequestPayload }
  | { kind: "user-input-requested"; requestId; activity; questions: UserInputQuestion[] }
  | { kind: "request-resolved"; requestId }
  | { kind: "turn-settled"; outcome: TurnOutcome }
  | { kind: "decode-error"; error: T3DecodeError }
  | { kind: "reconnected"; afterSequence: number }
```

`watch` subscribes with `orchestration.subscribeThread`; on socket loss it
resubscribes with `afterSequence` set to the last sequence seen and emits
`reconnected`. The snapshot frame is used to seed the derived items
(pending requests, current turn) so a consumer that joins late sees the
current state first.

The server never links a user message to a turn; providers steer a message
sent during an active turn into that turn, and the server's own queued-message
rule treats a message as taken once any turn's requested, started, or completed
stamp reaches the message's `createdAt`. A `TurnHandle` follows the same rule:
a turn already running at dispatch is its turn and settles it; a turn that
starts afterwards is its turn; a turn that starts while the followed one is
still running supersedes it; a turn that settled before the command is not its
turn. Two turns started back to back therefore settle together with the same
turn id, and `assistantMessage` is the last assistant message of that turn.

```ts
export class ShellApi {
  snapshot(): Promise<OrchestrationShellSnapshot>;
  watch(options?): AsyncIterable<ShellWatchItem>;
} // resumable like threads
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

## Idempotent ensure operations

| Operation                           | Key                        | Behaviour                                                                                            |
| ----------------------------------- | -------------------------- | ---------------------------------------------------------------------------------------------------- |
| `projects.ensure`                   | normalised `workspaceRoot` | find in shell snapshot; create with a fresh id when absent; update title only if given and different |
| `threads.ensure`                    | caller-supplied `threadId` | return existing shell thread; create otherwise; never mutates an existing thread                     |
| `auth.setAccessToken`               | token                      | validate then store; same token stored twice is a no-op                                              |
| `projects.delete`, `threads.delete` | id                         | absent resource resolves without error                                                               |

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
3. **RPC preferred over HTTP for dispatch.** The socket returns the typed
   `OrchestrationDispatchCommandError`; the HTTP route collapses it to a 500.
   HTTP remains the fallback when no socket is open and for snapshot reads.
4. **Ticket auth by default on the socket.** Bearer headers on the upgrade
   need a non-standard WebSocket option; tickets work everywhere and cost one
   HTTP round trip per (re)connect.

## Out of scope for this version

Pull requests, previews, devices, cloud relay, DPoP, desktop bootstrap,
attachment upload signing, source-control clone flows, and settings
mutation. They stay reachable through `rpc.callRaw` and `rpc.streamRaw`.
