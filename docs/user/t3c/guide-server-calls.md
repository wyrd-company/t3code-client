---
product: t3c
title: Files, repositories and server settings
order: 43
relationships:
  references: [library, api]
---

# Files, repositories and server settings

Use the typed routes and the server, repository and terminal methods.

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

## Voice

The `voice.*` routes transcribe on the server machine with a local speech model,
or forward a recording to a cloud speech provider. `voice.status` says if the
machine can transcribe and which model is selected. `voice.models` lists the
catalog; `voice.downloadModel` and `voice.selectModel` need `settings:write`.
When `voice.status` reports `supportsModelLinking`, `voice.linkModels` uses a model
file, or the model files of a folder, from elsewhere on the server's disk. It needs
`settings:write` and `filesystem:read`, and a model's `linkedFrom` names its file only
to a session with `filesystem:read`.
A transcription body is up to five minutes of 16 kHz mono Float32 PCM, framed
with its recognition options:

```ts
import {
  DEFAULT_SPEECH_TRANSCRIPTION_OPTIONS,
  encodeSpeechPcmRequest,
} from "@wyrd-company/t3code-lib";

const status = await client.routes.call("voice.status");
if (status.supported && status.state === "ready") {
  const { text } = await client.routes.call("voice.transcribe", {
    body: encodeSpeechPcmRequest(new Uint8Array(samples.buffer), {
      ...DEFAULT_SPEECH_TRANSCRIPTION_OPTIONS,
      speechLanguage: "en",
    }),
  });
}
```

`voice.transcribeCloud` sends the recording to the provider in `params`. Set the
provider's key first with `voice.setCloudKey`, as a literal or a secret
reference; `key: null` removes it. A cloud failure is a `T3HttpError` with
status 422 and tag `CloudSpeechError`; `schemas.speech.CloudSpeechError` decodes
its `body`. A local failure has reason `invalid_audio`, `speech_unavailable` or
`speech_busy`.

`T3Client.openSpeechStream` transcribes while the audio arrives, over its own
socket. It needs `orchestration:operate`. Send at most one second of PCM in each
`sendAudio` call; each call gets an `update` with the text so far. `finish` asks
for the final text. An event type that this library does not know is an unknown
variant:

```ts
import { schemas } from "@wyrd-company/t3code-lib";

const stream = await client.openSpeechStream({
  ...DEFAULT_SPEECH_TRANSCRIPTION_OPTIONS,
  speechLanguage: "en",
});
for (const chunk of chunks) stream.sendAudio(chunk);
stream.finish();
for await (const item of stream) {
  if (item.kind !== "item" || schemas.common.isUnknownVariant<"type">(item.value)) continue;
  if (item.value.type === "update") console.log(item.value.text?.committed);
  if (item.value.type === "finished") console.log(item.value.text);
  if (item.value.type === "error") console.error(item.value.message);
}
```

The server closes the socket after `finished` or `error`. `stream.closed` gives
the close code: 1000 after `finished`, 1008 after `error`.

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

`subscribeVcsBranch` streams the checked-out branch of `cwd` as `{ refName }`,
`null` when HEAD is detached. It sends the current branch first and then each
change. `vcs.refreshBranch` reads the branch again and publishes a change to the
open streams. Both need `orchestration:read`.

`terminal.observe` follows a terminal with only `terminal:read`, and it cannot
start one. `subscribeTerminalMetadata` lists every terminal and then follows them.
`client.terminal.observe` and `client.terminal.watchMetadata` wrap these streams.
`client.terminal.read` returns one terminal's snapshot with its retained history,
and `client.terminal.list` returns every terminal; both close their stream after
the first item.

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

A credential setting, such as a usage limit source's `managementKey` or an EAS
host's `accessToken`, takes either the literal or a secret provider reference
(`schemas.providerInstance.SettingsSecretValue`). The client tells the server it
reads references, so settings show a reference as written:

```ts
await client.rpc.call("server.updateSettings", {
  patch: {
    hiddenThreadTags: ["sample-tag"],
    hideTaggedThreads: true,
    usageLimitSources: {
      sample: {
        kind: "cliproxy",
        url: "http://127.0.0.1:8317",
        managementKey: { provider: "sample", reference: "op://vault/item/field" },
      },
    },
  },
});
```

### Managed policy

An administrator can put a policy file on the server's machine. The server then sends
`managedPolicy` in `server.getConfig`: the organization, the settings that users cannot change
and the limits that the server enforces. `schemas.managedPolicy` holds its shapes. The summary
carries no setting values.

```ts
const { managedPolicy } = await client.server.getConfig();
if (managedPolicy?.limits?.maxRuntimeMode) {
  // Create threads at or below this runtime mode.
}
```

A patch that changes a locked setting fails with a `ServerSettingsError` whose `operation` is
`write-managed-setting` and whose `managedSetting` is the locked path. A provider that the policy
does not allow fails with `use-disallowed-provider`. A scheduled task that the policy stops has a
`blockedByPolicy` reason. When the policy does not allow remote clients,
`auth.createPairingCredential` fails with a 403 `EnvironmentHttpForbiddenError`.

## Diagnostics

The server reads its traces, its process tree and its host. Most of these reads need
`diagnostics:read`. A failed read is part of the result: `error` is an `Option`
record and the result keeps what the server could read.

`client.diagnostics` wraps the reads: `traces`, `processes`, `hostResources`,
`resourceHistory` and `storageCleanupReport`. The last one returns the first item of
`server.getStorageCleanupReport`, `null` before the first cleanup, and closes the
stream. The facade has no method that signals, cleans up or restarts.

```ts
const { processes, error } = await client.diagnostics.processes();
if (error._tag === "Some") console.warn(error.value.message);

const history = await client.diagnostics.resourceHistory({
  windowMs: 60_000,
  bucketMs: 10_000,
});

for await (const item of client.rpc.stream("subscribeResourceTelemetry", {})) {
  if (item.kind === "item") console.log(item.value.groups.allT3.currentRssBytes);
}
```

`client.localServers` reads the local servers that the server's preview discovery
finds on its host: the listeners that it attributes to a thread terminal (`terminal`)
or to the agent of a thread (`agent`), of every thread, plus each configured URL that
answers as a web server. `list` returns one fresh scan and `watch` follows changes;
both need `orchestration:read`. `stop({ pid, port })` needs `terminal:operate`: the
server scans again, then sends SIGTERM and later SIGKILL to the process group of a
listener that it attributes to a thread, and fails with a `PreviewStopLocalServerError`
otherwise.

```ts
const { servers } = await client.localServers.list({
  configuredUrls: ["http://127.0.0.1:5173/"],
});
const own = servers.find((server) => server.agent?.threadId === "thread-1");
if (own?.pid != null) await client.localServers.stop({ pid: own.pid, port: own.port });
```

`server.signalProcess` sends `SIGINT` or `SIGKILL` to a process of
`server.getProcessDiagnostics`, identified by its `pid` and `startTimeMs`. It needs
`environment:maintain`. A refusal is a result: `signaled` is false and `message`
says why. `server.runStorageCleanup` needs `settings:write` and removes what the
`storageCleanup` settings allow on the server host. `server.checkOtlpEndpoint` also
needs `settings:write`: the server sends an empty export to the URL, and the answer
is `Accepted`, `Rejected` or `Unreachable`. `server.retryResourceTelemetry` needs
`diagnostics:read` and `environment:maintain`.

`server.getDatabaseStorage` reports `canReclaim` when a supervisor, such as the
desktop app or the background service, can restart the server. Then
`server.reclaimDatabaseSpace` (`environment:maintain`) restarts the server to return
free database pages to disk, and the connection closes. Otherwise it fails with
`DatabaseReclaimError`, whose `reason` names the offline command to run instead. A
failed repair shows as `reclaimFailure` on the next status.

`server.listTextGeneratorModels` (`settings:write`) lists the models of a text
generator: a saved one by `id`, or unsaved settings in `config`. `test: true` also
sends one short prompt and returns the `testedModel`. Both spend the API key. A
failure is a `TextGeneratorError` with a `detail`.

```ts
const { models } = await client.rpc.call("server.listTextGeneratorModels", {
  id: schemas.common.providerInstanceId("sample-generator"),
  config: { kind: "openaiCompatible", baseUrl: "https://models.example.invalid/v1" },
});
```
