---
product: t3c
title: Source control and pull requests
order: 46
relationships:
  references: [library, api]
---

# Source control and pull requests

Clone and publish repositories, import agent sessions and work with pull requests.

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
