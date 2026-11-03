---
relationships:
  references: library
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
- One credential. An access token, plain or bound to a DPoP key, obtained by
  exchanging a pairing or desktop bootstrap token or issued by
  `t3 auth session issue`.
- Orchestration protocol 2. The socket upgrade and the orchestration HTTP
  routes name the protocol the server requires.

This is an independent project, not part of T3 Code. Each release targets the
latest T3 Code release; the version it is tested against is the `t3` entry in
`devDependencies`.

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
`threads.search({ query, limit? })` returns at most `limit` (default and maximum 50) threads, one match each, and reports the limit. `threads.searchContent(input)`
is the server's within-thread find.

See [library architecture](https://github.com/wyrd-company/t3code-client/blob/main/docs/technical-designs/library.yml) for the architecture and
[library verification](https://github.com/wyrd-company/t3code-client/blob/main/docs/technical-designs/library-testing.yml) for tests.

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

## HTTP routes

`client.routes.call` validates the input, fills the path and decodes the answer:

```ts
const snapshot = await client.routes.call("orchestration.threadBoundedSnapshot", {
  params: { threadId },
  query: { deferWork: "1" },
});
const project = await client.routes.call("projects.mutate", { body: mutation });
const ticket = await client.routes.call("auth.webSocketTicketFor", { params: { use: "media" } });
```

## Files

Upload through a signed URL, and read through another. The token in a signed URL
is the credential, so treat a `relativeUrl` as a secret until it expires:

```ts
import { assetUrlParams, attachmentUploadUrlParams } from "@wyrd-company/t3code-lib";

const upload = await client.rpc.call("attachments.createUploadUrl", {
  type: "file",
  name: "notes.txt",
  mimeType: "text/plain",
  sizeBytes: body.byteLength,
});
await client.routes.call("attachments.upload", {
  params: attachmentUploadUrlParams(upload.relativeUrl),
  body,
});

const { relativeUrl } = await client.rpc.call("assets.createUrl", {
  resource: { _tag: "attachment", attachmentId: upload.attachmentId },
});
const { bytes, contentType } = await client.routes.call("assets.read", {
  params: assetUrlParams(relativeUrl),
});
```

`assets.read` holds the whole file in memory. To read part of a large file, fetch
`relativeUrl` yourself with a `range` header.

## Browser tabs

`preview.*` keeps the browser tabs of a thread. A `desktop` tab is state that a desktop
client reports. A `server` tab runs in the environment's headless browser, which the
server installs on first use, and `T3Client.openPreviewViewer` attaches to it:

```ts
const tab = await client.rpc.call("preview.open", { threadId, url, runtime: "server" });
const viewer = await client.openPreviewViewer({ threadId, tabId: tab.tabId, maxWidth: 1280 });

viewer.send({ type: "takeControl" });
for await (const item of viewer) {
  if (item.kind === "decode-error") continue;
  const output = item.value;
  if (!("type" in output)) continue; // A message from a newer server.
  if (output.type === "frame") draw(output.bytes); // A JPEG image.
  if (output.type === "fileChooser") {
    await client.routes.call("previewStream.upload", {
      query: { threadId, tabId: tab.tabId, chooser: output.id },
      body: { files: [{ name: "notes.txt", mimeType: "text/plain", bytes }] },
    });
  }
  if (output.type === "download") {
    const { bytes } = await client.routes.call("previewStream.download", {
      query: { threadId, tabId: tab.tabId, id: output.id },
    });
  }
}
const { tabGone, reconnect, hostSetup } = await viewer.closed;
```

The server sends one frame and waits. The iterator tells the server to go on when you
ask for the next item, so a slow consumer gets only the newest frame. Keep reading
while you wait for a message.

Each viewer is its own socket. It does not reconnect by itself, and `client.close()`
does not end it. A `break` or `viewer.close()` does. `viewer.closed` names the reason:
the tab closed (`tabGone`), the server asks you to attach again (`reconnect`), or the host
needs a command before its browser can start (`hostSetup`). A session without
`preview:operate`, or a viewer with `interactive: false`, only watches: the server drops
what it sends, and its `control` messages have `canOperate: false`. Only the viewer in
control can answer a file picker.

`subscribePreviewEvents` follows every tab, and `subscribeDiscoveredLocalServers` the
listeners that the environment finds, which include other processes on that host. The
server stops only a listener that it attributes to a thread's terminal or agent, and
`preview.stopLocalServer` signals its whole process group, so it needs `terminal:operate`.

## Devices

`device.*` keeps the simulators and emulators of a server's device hosts. Device support
is off until `device.configure` turns it on. A host in settings can be this machine, an
SSH host, an EAS account or a Simlock pool, and `state.hosts` holds them all:

```ts
const state = await client.rpc.call("device.configure", { enabled: true });
const device = state.devices.find((item) => item.platform === "android");
if (device) {
  const target = { hostId: device.hostId, deviceId: device.id };
  await client.rpc.call("device.open", { ...target, threadId, platform: "android" });
  await client.rpc.call("device.action", { ...target, type: "setAppearance", value: "dark" });
  const { settings, foregroundApp } = await client.rpc.call("device.detail", target);
  await client.rpc.call("device.close", { ...target, threadId });
}
```

`subscribeDeviceState` sends the state, then each change. A reader can read it, and
`device.list` with `inspectOnly` reads what each host has installed. `retryHostId` and
`updateTool` can start or install tools, so they need `orchestration:operate`.
`device.testHost`, `device.easAccount` and `device.simlockIdentity` check a host or a
credential before settings hold it, and need `settings:write`. A failure has a tag from
`schemas.rpcErrors`, such as `DeviceHostUnavailableError`. `/api/device-hub/*` is the
server's proxy to a host's device hub. The library has no entry for it.

## Repositories and terminals

`git.runStackedAction` streams progress until the action finishes or fails.
`review.*` reads only inside the server's workspace root or a known workspace:

```ts
import { schemas } from "@wyrd-company/t3code-lib";

for await (const item of client.rpc.stream("git.runStackedAction", {
  actionId,
  cwd,
  action: "commit_push",
  commitMessage: "Update the notes",
})) {
  if (item.kind !== "item" || schemas.common.isUnknownVariant<"kind">(item.value)) continue;
  if (item.value.kind === "action_finished") console.log(item.value.result.push.status);
}

const { commits } = await client.rpc.call("review.getBranchCommits", { cwd, baseRef: "main" });
const { sources } = await client.rpc.call("review.getDiffPreview", { cwd, baseRef: "main" });
```

`terminal.observe` follows a terminal with only `terminal:read`, and it cannot
start one. `subscribeTerminalMetadata` lists every terminal and then follows them.

## Settings

`server.updateSettings` takes a patch of only the keys to change, and answers with
the whole settings. It needs `settings:write`, `providers:manage` for the provider
keys and `providerInstanceMutation`, and both for a patch that has both:

```ts
await client.rpc.call("server.updateSettings", { patch: { idleCompaction: "off" } });

await client.rpc.call("server.updateSettings", {
  patch: {},
  providerInstanceMutation: { operation: "remove", instanceId },
});

const { keybindings, issues } = await client.rpc.call("server.upsertKeybinding", {
  key: "mod+shift+u",
  command: "usage.open",
});
```

A patch's lists are closed, so a mistyped value fails before the call. The answer
keeps loose fields. `server.updateProvider` runs the provider's installer on the
server host. `secrets.answerRequest` saves or declines an agent's secret request:
the server keeps the value, and the thread learns only the status.

## Diagnostics

The server reads its traces, its process tree and its host. Most of these reads need
`diagnostics:read`. A failed read is part of the result: `error` is an `Option`
record and the result keeps what the server could read.

```ts
const { processes, error } = await client.rpc.call("server.getProcessDiagnostics", {});
if (error._tag === "Some") console.warn(error.value.message);

const history = await client.rpc.call("server.getResourceTelemetryHistory", {
  windowMs: 60_000,
  bucketMs: 10_000,
});

for await (const item of client.rpc.stream("subscribeResourceTelemetry", {})) {
  if (item.kind === "item") console.log(item.value.groups.allT3.currentRssBytes);
}
```

`server.signalProcess` sends `SIGINT` or `SIGKILL` to a process of
`server.getProcessDiagnostics`, identified by its `pid` and `startTimeMs`. It needs
`environment:maintain`. A refusal is a result: `signaled` is false and `message`
says why. `server.runStorageCleanup` needs `settings:write` and removes what the
`storageCleanup` settings allow on the server host. `server.checkOtlpEndpoint` also
needs `settings:write`: the server sends an empty export to the URL, and the answer
is `Accepted`, `Rejected` or `Unreachable`. `server.retryResourceTelemetry` needs
`diagnostics:read` and `environment:maintain`.

## Provider sign-in

An instance with a sign-in controller, such as a managed Codex instance, signs in
through the server. These methods need `providers:manage`. Any other instance
refuses with `ProviderSetupError`.

```ts
const instanceId = schemas.common.providerInstanceId("managed-codex");
const { flowId } = await client.rpc.call("provider.auth.start", { instanceId });

for await (const item of client.rpc.stream("provider.auth.subscribe", { instanceId })) {
  if (item.kind !== "item") continue;
  if (item.value.phase === "waiting") console.log(item.value.authorizationUrl);
  if (["succeeded", "failed", "cancelled"].includes(item.value.phase)) break;
}
```

A person opens the URL. If the browser cannot reach the server's callback, pass the
address it ended on to `provider.auth.complete`, with the `flowId`. An interaction
that needs an answer goes to `provider.auth.respond`. `provider.auth.cancel` ends a
flow and `provider.auth.logout` signs the instance out and stops its sessions.

`provider.chatgpt.handoff.subscribe` runs a sign-in for another environment. The
`profile` of its `finished` item holds live tokens, so handle it as a credential and
pass it to `provider.chatgpt.import-profile` on that environment.

`provider.consumeResetCredit` spends a banked credit of the account, for an instance
or for an account in a usage limit source. `provider.uploadFeedback` sends feedback on
a thread's running provider session to that provider, and needs `orchestration:operate`.

## Provider install and the ACP registry

`provider.install.start` downloads a managed provider's executable into the server's
home, and `provider.install.subscribe` reports its progress. A server that finds a
usable executable on its `PATH` reports `succeeded` and downloads nothing.
`provider.install.cancel` takes the `operationId` of the install, and
`provider.install.remove` removes the managed executable. A failure is a
`ProviderSetupError`.

`server.searchAcpRegistry` reads the public registry index.
`server.prepareAcpRegistryAgent` installs an agent on the server's host, and can use
the host's package manager. An instance with the `acpRegistry` driver runs an agent
from the registry, or a local command:

```ts
const instanceId = schemas.common.providerInstanceId("sample-agent");
const input = { instanceId, projectId };

const { sessions } = await client.rpc.call("server.listAcpRegistrySessions", input);
const { threadId } = await client.rpc.call("server.importAcpRegistrySession", {
  ...input,
  sessionId: sessions[0].sessionId,
});
```

The server probes an agent in the background, so a method can refuse until the
instance's snapshot reports the capability. A session with an imported thread refuses
`server.deleteAcpRegistrySession`: delete the thread first.
`server.setAcpRegistryProvider` sends `headers` to the agent, and no method returns
them. A failure is an `AcpRegistryOperationError`, whose `reason` names the cause.

## Server update and T3 Connect

`server.updateServer` asks a server to move to an exact version of `t3`, and
`server.updateServerWithProgress` reports its `downloading` and `installing` stages. Only a
server under a service launcher or a desktop app can do this. Another server refuses with a
`ServerSelfUpdateError`. `server.commitDesktopUpdate` lets a desktop host restart into an
update that its app downloaded. Each needs `environment:maintain`.

`cloud.getRelayClientStatus` reports the tunnel client that T3 Connect needs, and
`cloud.installRelayClient` downloads it into the server's home and reports each stage. A
failure is a `RelayClientInstallFailedError`, and its `reason` names the cause.

The `connect.*` routes read and change the server's link to a relay. `schemas.cloudLink`
holds their shapes, and `schemas.httpErrors.EnvironmentHttpCloudError` their failures:

```ts
const state = await client.routes.call("connect.linkState");
const reachability = await client.routes.call("connect.checkReachability");
await client.routes.call("connect.preferences", { body: { publishAgentActivity: true } });
```

`connect.linkProof`, `connect.relayConfig` and `connect.unlink` make and remove a link. A proof
is only for the server's own loopback origin, and `relayConfig` takes only an `https` relay.
`connect.health` and `connect.mintCredential` are what a relay calls. They take no session,
because the server checks the proof, which the relay signs with the key from `relayConfig`. A
proof works once. The reads need `relay:read`, and the writes `relay:write`.

## Guests and webhooks

`guest.*` are the routes of a person or program that has a share's link from
`guestShares.create`. They send no session token. `guest.redeem` answers with a cookie for
that share, so give the client a `fetch` that keeps it, as for `auth.browserSession`. The
credential is the link's fragment. `schemas.orchestrationGuestShare` and
`schemas.orchestrationGuestStream` hold their shapes.

```ts
const guest = T3Client.create({ baseUrl, fetch: fetchWithCookieJar });
const query = { share: shareId };
await guest.routes.call("guest.redeem", { body: { credential, name: "Sample guest" } });
await guest.routes.call("guest.submit", { query, body: { shareId, text: "Sample proposal." } });
for await (const event of guest.routes.stream("guest.stream", { query }, signal)) {
  if (event.kind === "item") console.log(event.value);
}
```

`routes.stream` reads a route that answers with server-sent events: `guest.stream` and
`guest.commandOutput`. An event that does not decode is a `decode-error` item, and the stream
continues. A guest's refusal is a `T3HttpError` whose `reason` names the cause, such as
`inactive` when the link is closed or `unavailable` when the thread does not show the item.

`webhooks.webhookPost`, `webhookPut`, `webhookPatch` and `webhookGet` call a webhook task's
endpoint. The path holds the token, so no error names it, and `webhookUrlParams` reads the
params from `scheduledTasks.webhookEndpoint`. The server reads the body as raw bytes:

```ts
const params = webhookUrlParams(endpoint.path);
const { deliveryId } = await client.routes.call("webhooks.webhookPost", {
  params,
  headers: { "content-type": "application/json", "x-sample-signature": signature },
  body: new TextEncoder().encode(JSON.stringify({ action: "sample" })),
});
```

## Source control repositories and clones

`sourceControl.lookupRepository` reads a repository's URLs from the forge.
`sourceControl.publishRepository` creates the repository on the forge, adds it as a
remote and pushes the current branch. With no commit to push, its `status` is
`remote_added`. `sourceControl.cloneRepository` waits for the clone.

`projectClone.start` creates the project at once and clones in the background, so a
client can show progress and cancel:

```ts
const projectId = schemas.common.ProjectId.parse(crypto.randomUUID());
await client.rpc.call("projectClone.start", {
  projectId,
  title: "Sample",
  createdAt: new Date().toISOString(),
  provider: "gitlab",
  repository: "sample/repository",
  destinationPath: "/srv/sample",
});

for await (const item of client.rpc.stream("subscribeProjectClones", {})) {
  if (item.kind !== "item") continue;
  const clone = item.value.find((entry) => entry.projectId === projectId);
  if (clone && clone.phase !== "running") break;
}
```

Each stream item lists every clone that the server tracks. `projectClone.cancel` and
`projectClone.retry` answer `applied: false` when the clone is not in a phase that they
can change. A clone source is `provider` with `repository`, or `remoteUrl`. A credential
in a URL reaches Git. The server removes it from what it reports, and an error of this
library keeps `[redacted]` in place of any string that holds such a URL.

`sourceControl.signInStart` starts a forge's device flow and needs `settings:write`,
since a sign-in replaces the server's credential for that forge. `signInWait` resolves
when the sign-in ends, and `signInCancel` ends it. A server with no app for the forge
refuses with `reason: "unsupported"`. `sourceControl.appAccess` and
`sourceControl.starred` read what the server's forge account can reach.

`agentSessions.scan` reads the transcripts of the server's enabled providers on its host
and lists the folders that they ran in. `agentSessions.import` makes threads from the
recent transcripts of a project's folder. `expectedWorkspaceRoot` refuses the import
when the project has moved since the scan.

## Pull requests

The server reads the forge with its own credential, through one form for all of its
forge drivers. A `PullRequestRef` names a project and a pull request of that project's
repository:

```ts
const { entries, errors, nextCursors } = await client.rpc.call("pullRequests.list", {
  state: "open",
  involvement: "reviewing",
  limit: 50,
});

for (const { projectId, repository, number } of entries) {
  const ref = { projectId, repository, number };
  const detail = await client.rpc.call("pullRequests.detail", ref);
  const { patch } = await client.routes.call("pullRequests.diff", { body: ref });
}
```

`errors` lists each project that could not be read, and the other rows still arrive.
Pass `nextCursors` back as `cursors` for the next page. A row has zero line counts until
`pullRequests.listStats` reads them. `pullRequests.detail` has `capabilities`, which say
what the host can do, and `viewerPermissions`, which say what the viewer can do.
The diff is a route, not an RPC method, and it pages with `cursor`.

`pullRequests.summary`, `preview`, `checks`, `activity`, `stack`, `filesViewed` and
`changeBreakdown` read one part of a pull request. `threadComments` reads the next
comments of a review thread from its `nextCommentsCursor`, and `diffFileContents` reads
the two sides of one file. `reviewGuide` reads the stored guide and generates nothing.
`linkedThreads` lists the threads linked to a pull request. `filterOptions`,
`reviewerCandidates` and `labelCandidates` list the values that a client can offer.
`pullRequests.subscribeRefreshes` sends a new revision after which a client reads again.
`pullRequests.invalidate` drops cached reads, so that the next read asks the host: those
of one pull request with `reference`, listings and viewers without it, and only viewed
marks with `filesViewedOnly`. Then it tells subscribers, except with `filesViewedOnly`.

A write takes a `PullRequestRef` and goes to the host with the server's credential. It
needs `source-control:write`:

```ts
await client.rpc.call("pullRequests.comment", { ...ref, body: "Sample comment" });
await client.rpc.call("pullRequests.submitReview", {
  ...ref,
  verdict: "approve",
  body: "Sample review",
  comments: [
    { path: "sample.txt", position: { kind: "added", newLine: 1 }, body: "Sample line comment" },
  ],
});
await client.rpc.call("pullRequests.runAction", { ...ref, action: "merge", mergeMethod: "squash" });
```

`update`, `updateComment`, `replyToThread`, `setThreadResolution`, `setReaction`,
`requestReviewers`, `setLabels` and `setFilesViewed` change one part of a pull request.
Read `capabilities` and `viewerPermissions` from `pullRequests.detail` first. A host with
no pending review can post part of a review and then fail, and it sends the verdict last.
`capabilities.viewedFiles` says if viewed marks are on the host or on this server.

`pullRequests.generateReviewGuide` needs `orchestration:operate` and the
`reviewGuidesEnabled` setting, and the project must be a checkout of the repository. It
starts a run with the review guide model and answers at once. `pullRequests.reviewGuide`
reads the run and then the guide. `pullRequests.reportState` tells the server the state
that a client read.

A driver can lack a part: GitLab has no routing identity, stacks, paged thread comments,
label writes or `request-changes` verdict. A failure is a `PullRequestUnavailableError`, whose `reason` says that the tool
or credential is missing or the host is not supported, or a `PullRequestOperationError`.
The diff route sends the same two failures as HTTP 503 and 502. `expectedAccountId`,
with `host`, refuses a read unless the server's credential for the host is that account.

## Proof-bound sessions

A session bound to a DPoP key is useless to someone who holds only its token.
The credential store keeps the key with the token, and every request and socket
upgrade then carries a proof:

```ts
import { T3Client, fileCredentialStore, generateDpopKey } from "@wyrd-company/t3code-lib";

const client = T3Client.create({
  baseUrl,
  credentials: fileCredentialStore(credentialPath),
});
await client.auth.exchangePairingToken(pairingToken, { dpopKey: generateDpopKey() });
```

A program that starts the server in desktop mode exchanges the token that derives
from its bootstrap secret with `currentDesktopBootstrapToken(secret)`.

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

## Development

```bash
pnpm install
pnpm run check        # format and lint
pnpm run typecheck
pnpm run test         # unit tests, no server needed
pnpm run test:live    # starts the pinned t3 server, see docs/technical-designs/library-testing.yml
task check            # all of the above
```

Releases use the independent `t3code-lib` release unit; see [release pipeline](https://github.com/wyrd-company/t3code-client/blob/main/docs/technical-designs/releasing.yml).

## License

MIT
