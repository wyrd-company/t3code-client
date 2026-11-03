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
