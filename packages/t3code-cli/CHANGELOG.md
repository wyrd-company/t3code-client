# Changelog

## 0.2.3

### Features

- Target stock T3 Code 0.1.9, orchestration protocol 2. `TARGET_T3_CODE_VERSION` is `0.1.9`, and `t3c version` compares the server with 0.1.9.

## 0.2.2

### Features

- Add `--thread-mode new_thread|continue|fresh_session` to `t3c schedule create` and `update`, and `threadMode` to their JSON input. `fresh_session` keeps one thread and starts each later run in a new provider session. `t3c schedule show` prints the mode and the thread on its `thread` line, with `-` before a one-thread task's first run.
- Target stock T3 Code 0.1.7, orchestration protocol 2. `TARGET_T3_CODE_VERSION` is `0.1.7`, and `t3c version` compares the server with 0.1.7.
- Add thread tags. The library adds `threads.setTag(threadId, tag, tagged)`, which sends `thread.tag.set` and returns the tags read back from the shell, and a `tag` filter on `threads.list`. `t3code-mcp` adds `thread_tag` and `tagged_threads` (bounded summaries, default 100, at most 500). `t3c` adds `thread tag <threadId> <tag> [--remove]` and `thread list --tag <tag>`. Tags match by exact spelling and case after trimming; the web client can hide tagged threads.
- t3c server info prints readable, labelled lines by default: server, environment, platform, database and capabilities, then each provider with its auth status, its selectable models (slug, name, default) and their `--model-option` ids and choices (`*` marks the default). Text output omits account details. `--json` output is unchanged.
- Target stock T3 Code 0.1.8, orchestration protocol 2. `TARGET_T3_CODE_VERSION` is `0.1.8`, and `t3c version` compares the server with 0.1.8.

### Fixes

- Ship commander 15.1.0 with `t3c`.
- Add the remaining T3 Code 0.1.7 fields: one-time scheduled tasks (`{ type: "once", runAt }`, capability `oneTimeSchedules`), settings `hiddenThreadTags`, `hideTaggedThreads` and `usageModelFilter`, a usage `modelFilter` on `server.getUsageSummary` input and result, turn usage `models`, `localCommand` and `otherUsage`, and the select descriptor `role: "reasoning"`. Credential settings (`managementKey`, EAS `accessToken`) accept a secret provider reference (`SettingsSecretValue`), and the socket declares `clientCapabilities=settingsSecretReferences` so that settings show references as written. `t3c schedule show` prints a one-time trigger.

## 0.2.1

### Fixes

- Add the T3 Code 0.1.6 orchestration reads and force stop: `threads.forceStop`, `shell.threadFamily`, `shell.worktreeThreadIds`, `shell.olderSettledThreads`. `shell.snapshot` and `shell.watch` accept `omitIdleSubagents` and `omitOlderSettled`, and snapshots carry `olderSettled`. `threads.search` accepts `olderSettledBefore`, `projectIds`, `environmentLabel` and `titlesOnly`, and its results carry `snapshotSequence`, `threads` and match `quality`, `hits` and `messageId`. `ServerConfig` exposes `shellThreadFamilies` and `shellOlderSettled`.
- Add the browser tab methods `preview.open`, `resize`, `adjust`, `close`, `list`, `clearProfile`, `reportProfiles`, `reportStatus` and `stopLocalServer`, and the streams `subscribePreviewEvents` and `subscribeDiscoveredLocalServers`. Add the routes `previewStream.download` and `previewStream.upload`, and `T3Client.openPreviewViewer` for the viewer socket of a tab in the server's browser. `schemas.preview` and `schemas.previewViewer` hold their shapes.
- Add the provider install methods `provider.install.start`, `provider.install.cancel`, `provider.install.subscribe` and `provider.install.remove`, and the ACP registry methods `server.searchAcpRegistry`, `server.prepareAcpRegistryAgent`, `server.uninstallAcpRegistryManagedBinary`, `server.acceptAcpRegistryUrlAuth`, `server.listAcpRegistrySessions`, `server.importAcpRegistrySession`, `server.deleteAcpRegistrySession`, `server.listAcpRegistryProviders`, `server.setAcpRegistryProvider`, `server.disableAcpRegistryProvider` and `server.logoutAcpRegistry`. `schemas.providerInstall` and `schemas.acpRegistry` hold the new types, and `AcpRegistryOperationError` joins the RPC error record. `redactSecrets` also removes a whole `headers` map, and `T3RpcError` and `T3RpcDefectError` now keep only a redacted copy of a failure.
- Add the pull request read methods `pullRequests.list`, `listStats`, `filterOptions`, `summary`, `routing`, `routingIdentity`, `stack`, `linkedThreads`, `detail`, `preview`, `checks`, `activity`, `reviewGuide`, `threadComments`, `diffFileContents`, `filesViewed`, `changeBreakdown`, `reviewerCandidates`, `labelCandidates` and `subscribeRefreshes`, and the `pullRequests.diff` route. `schemas.pullRequests` holds the new types, and `PullRequestUnavailableError` and `PullRequestOperationError` join the RPC error record.
- Add the workspace methods `terminal.clear`, `terminal.observe`, `subscribeTerminalMetadata`, `vcs.init`, `vcs.pull`, `git.runStackedAction`, `git.resolvePullRequest`, `git.preparePullRequestThread`, `review.getBranchCommits`, `review.getDiffPreview` and `review.getDiffFileContents`. `subscribeVcsStatus` takes `includeRemote`, local status reports `branchChanges`, and `RpcErrorRecord` decodes the `Vcs*` process failures. `schemas.git` and `schemas.review` hold the new types.
- Add the provider sign-in methods `provider.auth.start`, `provider.auth.respond`, `provider.auth.complete`, `provider.auth.cancel`, `provider.auth.logout`, `provider.auth.subscribe`, `provider.chatgpt.reconnect-profile`, `provider.chatgpt.import-profile` and `provider.chatgpt.handoff.subscribe`, with `provider.consumeResetCredit` and `provider.uploadFeedback`. `schemas.providerSetup` holds the new types. `redactSecrets` also removes a device code and a URL whose query holds a code or an identity token.
- Target stock T3 Code 0.1.6. Follow methods the server removed: `server.getSettings()` reads the settings from the server configuration and `scheduledTasks.list()` reads the first item of the task subscription, with the same results. `ShellApi.watchArchived`, `TerminalApi.watchEvents`, `AuthClient.listPairingLinks` and `AuthClient.listClients` are removed because the server no longer serves them: read archived threads with `archivedSnapshot`, and read pairing links and client sessions from the first `watchAccess` snapshot.
- Add `projects.createFromThread`, which turns a No project thread's own folder into a project in place. `projects.update` accepts `pinned` and `archived`, and projects carry `pinnedAt` and `archivedAt`. Environment capabilities expose `threadProjectFromScratch` and `projectOrganization`.
- Type the orchestration fields of T3 Code 0.1.6. Thread rows expose `opens` and `lineage.sideChat`. Turn items expose `monitor`, `unresponsiveAt`, `idleCompaction`, `filesTotal`, `remoteChild` and the secret `delivery`. Subagents expose `remoteChild`, workflow agents `effort` and `speed`, background work `awaited`, and runtime requests `feedback` and `supportsFeedback`. Commands accept `stopDelegatedTasks`, `onlyIfUnused`, `opened`, `searchQuery`, `sideChat` and `feedback`, and `threads.respondToApproval` accepts `feedback`. The launch result exposes `sequence`. `payloadBudgetExceeded` is removed, because the 0.1.6 server no longer sends it.
- Add the methods `server.updateServer`, `updateServerWithProgress` and `commitDesktopUpdate`, `cloud.getRelayClientStatus` and `installRelayClient`, and the `connect.*` routes for T3 Connect links. `schemas.serverSelfUpdate`, `schemas.relayClient` and `schemas.cloudLink` hold their shapes.
- Add the file methods `filesystem.browse`, `filesystem.getMetadata`, `assets.createUrl`, `assets.persistChatAttachments`, `attachments.createUploadUrl`, `attachments.delete` and `shell.openInEditor`, and the signed routes `assets.read` (`GET /api/assets/*`) and `attachments.upload` (`POST /api/attachments/upload/*`). `assetUrlParams` and `attachmentUploadUrlParams` turn a `relativeUrl` into route params. `schemas.server.EditorId` names every editor of the target build.
- Add the MCP OAuth routes `mcpOAuth.protectedResource`, `mcpProtectedResource`, `authorizationServer`, `register`, `authorize`, `approval`, `decision` and `token`. A route with `redirectResponse` does not follow a redirect, and answers with `{ location }`. `schemas.authMcp` holds their shapes.
- Add the settings methods `server.updateSettings`, `server.upsertKeybinding`, `server.removeKeybinding`, `server.updateProvider`, `server.reportClientActivity`, `server.discoverSourceControl`, `server.refreshUsageRates` and `secrets.answerRequest`. A settings patch is validated key by key and asks for the scope the server requires. `RpcErrorRecord` decodes `ServerProviderUpdateError` and `SecretRequestError`, and `ServerSettingsError` no longer needs a `cause`. `schemas.settingsPatch`, `schemas.providerInstance`, `schemas.deviceHosts`, `schemas.serverActions` and `schemas.sourceControl` hold the new types.
- Add the guest routes `guest.redeem`, `session`, `submit`, `stream`, `render`, `item`, `history`, `commandOutput`, `attachment` and `media`, and the webhook routes `webhooks.webhookPost`, `webhookPut`, `webhookPatch` and `webhookGet`. `HttpRouteClient.stream` reads a route that answers with server-sent events, and a route input can carry `headers`. `webhookUrlParams` reads the params of a webhook endpoint, and `schemas.orchestrationGuestStream` holds the shapes of a guest stream.
- Add `client.guestShares` with `create`, `close`, `sendMessage` and `dismissMessage`. Thread records expose `guestShare`, shell rows expose `pendingGuestMessageCount`, message context exposes `guest`, thread events include `thread.guest-share-updated`, commands include `thread.guest-share.close` and `thread.guest-message.dismiss`, `message.dispatch` takes `guestMessageId`, and `RpcErrorRecord` includes `GuestShareCreateError`.
- Add `client.peerLinks` with `list`, `link`, `unlink` and `answerRequest`. Thread rows expose `linkOrigin` and `delegatedFrom`, turn items include `link_request`, environment capabilities expose `peerLinks`, `mcpModeLimitHeader` and `linkFence`, and `RpcErrorRecord` includes `PeerLinkError` and `PeerLinkRequestError`.
- Add `client.routes`, a typed entry for each HTTP route by name, with `POST /api/auth/browser-session`, `POST /api/auth/websocket-ticket/:use`, `POST /api/projects/mutate` and `GET /api/orchestration/threads/:threadId/bounded`. `exchangePairingToken` and `setAccessToken` accept `dpopKey` for a session bound to a DPoP key: `generateDpopKey` makes the key, the credential store keeps it with the token, and every request and socket upgrade carries a proof. `currentDesktopBootstrapToken` derives the token of a desktop bootstrap secret. `T3ClientOptions.fetchAuthenticates` lets a `fetch` with a cookie jar carry a browser session. `ThreadHistoryPageOptions.view` accepts `work`.
- Type the server field changes of T3 Code 0.1.6. Environment capabilities expose `sideChats`, `threadForceStop`, `localServerStop` and `desktopAppChannelSwitch`, and the descriptor exposes `databaseMigration`. The server configuration exposes `secretProviderSettings`, `secretReferences`, and the source and variable of each OTLP endpoint. Terminal snapshots and activity events expose `cols` and `rows`, pull request watches expose `owedChecks` and `checksAwaitedSince`, and message context has an `environment` record. `GitCommandError` has the `config_locked` reason, and usage has the `muse` provider. `reasoningMessages` and `requiresNewThreadForModelChange` are removed, because the 0.1.6 server no longer sends them.
- Add `server.getNpmRelease` and `server.prepareTriage`. `server.refreshProviders` accepts `reloadSecrets`, `workspaceSnapshotsOnDemand` and `usageLimitsCommand`, `server.watchConfig` accepts `usageLimitsCommand` and `workspaceSnapshotsOnDemand`, and `vcs.status` accepts `localOnly`. Environment capabilities expose `npmReleaseLookup`, `triage` and `providerWorkspaceSnapshotsOnDemand`.
- Add the diagnostics methods `server.getTraceDiagnostics`, `server.getProcessDiagnostics`, `server.getHostResources`, `server.getProcessResourceHistory`, `server.getResourceTelemetryHistory`, `server.retryResourceTelemetry`, `server.checkOtlpEndpoint`, `server.signalProcess`, `server.runStorageCleanup`, `server.getStorageCleanupReport` and `subscribeResourceTelemetry`. `schemas.diagnostics`, `schemas.resourceTelemetry` and `schemas.storageCleanup` hold the new types.
- Add the source control methods `sourceControl.lookupRepository`, `sourceControl.cloneRepository`, `sourceControl.publishRepository`, `sourceControl.signInStart`, `sourceControl.signInWait`, `sourceControl.signInCancel`, `sourceControl.appAccess` and `sourceControl.starred`, the tracked clone methods `projectClone.start`, `projectClone.cancel`, `projectClone.retry` and `subscribeProjectClones`, and the agent session methods `agentSessions.scan` and `agentSessions.import`. `schemas.projectClone` and `schemas.agentSessions` hold the new types, and the failures of these methods join the RPC error record. `redactSecrets` also removes a string that holds a URL with a credential, and it reads strings in arrays.
- Add the pull request write methods `pullRequests.setFilesViewed`, `runAction`, `update`, `comment`, `updateComment`, `submitReview`, `replyToThread`, `setThreadResolution`, `setReaction`, `requestReviewers` and `setLabels`, the review guide run `pullRequests.generateReviewGuide`, and `pullRequests.invalidate` and `reportState`. `schemas.pullRequests` holds their inputs.
- Add the device methods `device.list`, `configure`, `testHost`, `easAccount`, `simlockIdentity`, `open`, `close`, `shutdown`, `detail` and `action`, and the stream `subscribeDeviceState`. `schemas.device` holds their shapes, and `schemas.rpcErrors` their failures.

## 0.2.0

### Features

- Add launch and continuation controls: repeatable --model-option key=value validated against the selected model's advertised options, --clear-model-options, --existing-worktree, --branch, and --start-from-origin/--no-start-from-origin for new worktrees. thread send accepts the model option controls.
- Add thread stop, thread queue resume and thread queue start commands; expose queued run IDs in text status for selection.
- Add thread status, requests, usage, diff and search commands with JSON envelopes and concise text.
- Add thread find with provider and native session inputs, returning a T3 Code thread ID or null.
- Add schedule management, webhook endpoint rotation and delivery inspection, exact provider status, and historical usage summaries with explicit date and time-zone bounds. Schedule input accepts JSON files or stdin and focused execution selection flags while preserving omitted update fields.

### Fixes

- Validate bound scheduled-task threads against their effective project before CLI creation or target changes. Expose explicit target validation with read scope while preserving native operate-only upserts and omitted update fields.

## 0.1.1

### Fixes

- Publish the t3c docs from docs/user in the wyrd.foo format.
- Report stock T3 Code 0.1.2 as the target server and verify CLI compatibility.

## 0.1.0

### Features

- Provide the t3c Node command-line client for stock T3 Code, with its command contract, commander composition, version reporting, structured output, shared error mapping, installable executable and isolated live acceptance recipe.
  
  Specify the t3c command surface, execution policies and Dagu harness contract.
  
  Pair named server profiles from links and stdin tokens, probe exact profile credentials and effective overrides, switch the current server and remove local credentials.
  
  Run prompts from arguments, files or stdin against selected projects, models and worktrees; start, send to, wait on, read, list, interrupt and answer threads; list and ensure projects; and report server providers and models. Waiting commands support run deadlines that detach or interrupt, signal interruption, pending-request policies, approval decisions, streaming and structured results.
  Prepare tagged documentation, generated library reference, isolated recorded demo, registry shrinkwrap handoff and Homebrew distribution with local artifact validation.
  
  Preserve the tap formula when published bytes differ, protect existing Homebrew installations with preflight regression coverage, and record the unreleased CLI demo without a visible interim version frame.
  
  Record real stdin pairing to a fresh profile, start and wait on one linked thread and run, and list its selected project; preserve generic continuation and thread listing with verified outcomes.
