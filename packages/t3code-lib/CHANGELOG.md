# Changelog

## 0.4.1

### Features

- Live transcription of T3 Code 0.1.8: `T3Client.openSpeechStream` opens `/ws/voice` with a media ticket and `orchestration:operate`, sends the recognition options, then `sendAudio` sends 16 kHz mono Float32 PCM (at most `SPEECH_STREAM_MAX_CHUNK_BYTES` in one call) and `finish` asks for the final text. The stream yields `ready`, `update`, `finished` and `error` events, and `closed` gives the close code. `schemas.speechStream` holds the socket messages. `WebSocketLike.send` also takes bytes, so a custom `webSocket` must send binary messages.
- Voice routes of T3 Code 0.1.8: `client.routes` has the 14 `voice.*` routes (status, model catalog, download, select, cancel, remove, acceleration, unload timeout, local and cloud transcription, cloud keys, OpenRouter models, transcript cleanup); `schemas.speech` holds their types and `CloudSpeechError`. `encodeSpeechPcmRequest` frames a transcription body. The settings patch takes `cloudSpeechCredentials`, `speechModelId`, `speechAcceleration`, `speechModelUnloadTimeout`, `speechProjectCustomWords` (also per project) and `speechPostProcessingModelSelection`. Capabilities read `voiceTranscription` and `cloudVoiceTranscription`; the cloud link state reads `tunnelHostname` and `linkableHere`; request errors read reasons `invalid_audio`, `speech_unavailable` and `speech_busy`.
- Add typed managed policy fields: `managedPolicy` on the server config (`schemas.managedPolicy` exports `ManagedPolicySummary` and its limits), `runtimeModeCeiling` on MCP approval details, and `blockedByPolicy` on scheduled tasks. `ServerSettingsError` gains the operations `write-managed-setting` and `use-disallowed-provider` with `managedSetting`, `managedBy` and `providerLabel`, `RelayClientInstallFailedError` gains the reason `managed_by_policy`, and `schemas.httpErrors.EnvironmentPairingCredentialError` types the failures of the pairing credential route, including the policy 403.
- Add typed thread tags: the `thread.tag.set` command, the `thread.tags-updated` event, and optional `tags` on threads, shells and projections (`schemas.orchestrationThreadTags` exports `ThreadTag` and `StoredThreadTags`). User-message turn items expose optional `modelSwitch`, and provider turn capabilities expose optional `activeSteeringAcceptsAttachments`.
- Target stock T3 Code 0.1.7, orchestration protocol 2. `TARGET_T3_CODE_VERSION` is `0.1.7`, and `t3c version` compares the server with 0.1.7.
- Add read-only terminal reads. The library adds `TerminalApi.observe`, `TerminalApi.watchMetadata`, `TerminalApi.list` (every terminal, from the first metadata snapshot) and `TerminalApi.read` (one terminal snapshot with its retained history), all with `terminal:read`. `t3code-mcp` adds `thread_terminals`, which lists the server terminals of a thread, and `terminal_output`, which returns the bounded plain-text tail of one terminal's history with its status and exit details. Neither tool starts, attaches to or writes to a terminal.
- Add local server reads and stop. The library adds `client.localServers` (`LocalServersApi`): `list` returns one fresh scan of the local servers that the server finds on its host (listeners that it attributes to a thread terminal or a thread's agent, plus configured URLs that answer as web servers), `watch` follows changes, both with `orchestration:read`, and `stop({ pid, port })` stops a thread-attributed listener's process group with `terminal:operate`. `t3code-mcp` adds `local_servers` (optional `threadId` filter and `urls` to probe) and `stop_local_server`, which stops only a listener that the named thread's agent started and refuses servers in thread terminals with code `terminal_owned`.
- Add thread tags. The library adds `threads.setTag(threadId, tag, tagged)`, which sends `thread.tag.set` and returns the tags read back from the shell, and a `tag` filter on `threads.list`. `t3code-mcp` adds `thread_tag` and `tagged_threads` (bounded summaries, default 100, at most 500). `t3c` adds `thread tag <threadId> <tag> [--remove]` and `thread list --tag <tag>`. Tags match by exact spelling and case after trimming; the web client can hide tagged threads.
- Field changes of T3 Code 0.1.8: `auth.pairingCredential` takes and returns `access`, which binds the code to one agent sign-in at that level. Capabilities read `fastWorktreeCheckout`, `vcsBranchStatus`, `modelCatalogRefresh`, `mcpApprovalCodes`, `freshContext` and `scheduledTaskThreadModes`; the server config reads `secretRequestReferences`. `secrets.answerRequest` takes a `reference` answer, and `SecretRequestError` reads `reference_unreadable` with its `provider`. Settings patches take `fastWorktreeCheckout`, `promptSuggestionsEnabled`, `ghqCloneLayout` and `textGenerators` (which needs `providers:manage`); removing a secret provider also needs `settings:write`. A Simlock `agentToken` takes a secret reference, and device host statuses read `incompletePlatforms`. `review.getDiffPreview` takes `sourceKind`, `trackedOnly` and `metadataOnly` and reads `patchesDeferred` and `incomplete`. Terminals and project scripts take `stopOnSettle`, `FilesystemBrowseError` reads `pathMissing`, source control media assets take `repository`, and keybindings know `composer.dictation`. Upstream removed the `cursorKeychainUsageEnabled` setting and the usage source `action`, so these are removed here.
- Pull request changes of T3 Code 0.1.8: `pullRequests.runAction` takes `replyWithSummary` and then answers with the `PullRequestSummary`; `pullRequests.reviewerCandidates` takes `query` (`PullRequestReviewerCandidatesInput`); `pullRequests.filterOptions` takes kind `references` with a `sigil` and reads `references` (`PullRequestReferenceCandidate`). Capabilities read `mentions`, `referenceSigils` and `reviewers.searchCandidates`; summaries read `headSha`, `autoMergeEnabled` and `autoMergeMethod`; previews read `updatedAt` and `observedAt`; linked threads read `settled`; thread comment pages read `hiddenCount`.
- Add typed `sourceControl.star`, which stars a repository as the server's forge account, and `orchestration.getNativeChildWork`, which reads what a provider-native subagent's children did. `OrchestrationV2GetNativeChildWorkError` is a recognized RPC error, and `schemas.orchestrationNativeChildWork` exports the result schemas.
- Scheduled tasks read and send `threadMode` (`new_thread`, `continue`, `fresh_session`). `scheduledTasks.update` with `threadId: null` and no mode sends `new_thread`, so the task leaves its thread on servers that keep a stored mode.
- Add `provider.auth.removeMethod`, `server.reclaimDatabaseSpace` and `server.listTextGeneratorModels`. Auth methods read `canRemove`, the database storage status reads `canReclaim` and `reclaimFailure`, and `DatabaseReclaimError` and `TextGeneratorError` decode. `server.refreshProviders` accepts `modelCatalogOnly` and `providerCatalogsOnDemand`, and `server.watchConfig` accepts `providerCatalogsOnDemand`. `schemas.textGenerator` holds the new types.
- Add `orchestration.getThreadTitles`, `orchestration.getThreadLinkMetadata` (config flag `threadLinkMetadata`), `orchestration.subscribePromptSuggestion`, `subscribeVcsBranch` and `vcs.refreshBranch`. `threads.startTurn` takes `freshContext`; runs read `freshContext` and `usageLimitContinuationOfRunId`, user messages read `freshContext`, and `message.dispatch` sends it. `thread.settle` sends `expectedLatestRunId`. `orchestration.subscribeShell` takes `httpSnapshotFallback` and streams `snapshot-required`. Provider sessions read `extensionStatuses`, provider turns read `model`, remote task children read `title`, and secret request items read `url`. `isDelegatedAppThread` names subagent and delegated threads. `schemas.orchestrationThreadReads` holds the new types.
- Target stock T3 Code 0.1.8, orchestration protocol 2. `TARGET_T3_CODE_VERSION` is `0.1.8`, and `t3c version` compares the server with 0.1.8.
- Add read-only server diagnostics. The library adds `client.diagnostics` (`DiagnosticsApi`) with `traces`, `processes`, `hostResources`, `resourceHistory` and `storageCleanupReport` (the first report stream item, `null` before the first cleanup). `t3code-mcp` adds `server_traces`, `server_processes`, `server_host_resources`, `server_resource_history` and `server_storage_cleanup_report`. Process lists, the history window and each command line, failure cause and log message are bounded, and Effect `Option` fields are returned as their value or null. No tool signals a process, runs a cleanup or restarts the resource monitor.
- Add the remaining T3 Code 0.1.7 fields: one-time scheduled tasks (`{ type: "once", runAt }`, capability `oneTimeSchedules`), settings `hiddenThreadTags`, `hideTaggedThreads` and `usageModelFilter`, a usage `modelFilter` on `server.getUsageSummary` input and result, turn usage `models`, `localCommand` and `otherUsage`, and the select descriptor `role: "reasoning"`. Credential settings (`managementKey`, EAS `accessToken`) accept a secret provider reference (`SettingsSecretValue`), and the socket declares `clientCapabilities=settingsSecretReferences` so that settings show references as written. `t3c schedule show` prints a one-time trigger.

## 0.4.0

### Features

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

### Fixes

- Move the library's usage detail from its README into new library guides in the t3c documentation.

## 0.3.0

### Features

- Inspect a thread's runs, queue, pending requests, background work and provider usage, read checkpoint diffs, and search across or within threads.
- Resolve a provider instance and native session ID to its T3 Code thread, including archived threads and earlier provider sessions.
- Add native thread Stop, queue Resume and selected queued-message Start methods with cancellation and dispatch error propagation; preserve legacy stop behavior.
- Validate bound scheduled-task threads against their effective project before CLI creation or target changes. Expose explicit target validation with read scope while preserving native operate-only upserts and omitted update fields.
- Add scheduled task management through `T3Client.scheduledTasks`: list, read, create, update while keeping omitted settings, enable, delete, run, webhook endpoint lookup, webhook token rotation and webhook delivery records. Add `server.providerStatus` for current provider records and `server.usageSummary` for historical token usage and cost.

## 0.2.0

### Features

- Type server.getDatabaseStorage and add server.watchDatabaseStorage so callers can follow the state database's size and reclaimable space.
- Match stock 0.1.2 standard auth scopes and remove the obsolete administrative scope set.
- Type the public queued-run.start command so threads.dispatch and typed rpc.call can send it.
- Type projects.listIgnoredFiles and add projects.files.listIgnored so callers can list a workspace's untracked git-ignored files.
- Type configuration issues in server configuration reads, snapshots and keybinding updates as the two known keybinding issue kinds, keeping unknown kinds and omitting malformed records.
- Type the public thread.stop command with an optional plain reason string so threads.dispatch and typed rpc.call can send it.
- Type resolved keybindings in server configuration reads, snapshots and keybinding updates as rules with command, shortcut and recursive when conditions, keeping unknown commands, node types and metadata, omitting malformed rules and rejecting more than 256 rules.
- Type orchestration.subscribeCommandOutput and add threads.watchCommandOutput so callers can follow one command row's terminal output.

### Fixes

- Type optional observability logs endpoint metadata in configuration reads and snapshots.
- Type and validate optional cost metadata on thread context usage reads and events.
- Type and validate optional installed provider CLI version metadata.
- Type optional source token usage metadata on context transfers.
- Type and validate the optional project provider instance overrides capability.
- Type optional latest-run stop-request metadata in thread shells.
- Type optional approval full-access override metadata in thread reads and events.
- Type optional preview metadata on user-input question options.
- Type and validate the optional worktree root in VCS status responses and events.
- Type and validate the optional usage-limit-source environment capability.
- Type and validate the optional database storage environment capability.
- Type optional provider instance metadata on pending subagent tasks.
- Type and validate the optional thread restart continuation capability in environment and configuration reads.
- Type optional observability metrics URL metadata in server configuration reads and snapshots.
- Type and validate the optional repository-root flag returned by VCS reference listing.
- Type optional provider native-session metadata in configuration reads and streams.
- Type and validate the optional thread auto-settle opt-out environment capability.
- Type optional remote-open target username metadata in configuration reads and snapshots.
- Type optional provider auth canLogout metadata in configuration reads and streams.
- Expose optional logs directory path metadata in configuration reads and snapshots.
- Type optional nullable app-thread lastSnoozeWakeAt metadata in detail, projection and watch records.
- Type optional ended-watch metadata on thread pull request links.
- Type optional workflow-script classification on conversation messages.
- Type optional expectedBranch metadata on thread updates.
- Expose optional workspace metadata on usage-limit source accounts.
- Type and validate the optional environment icon capability metadata.
- Type and validate optional thread-wait blocking metadata in thread shells.
- Type optional provider supported runtime mode metadata in configuration reads and streams.
- Type and validate the optional environment active thread reorder capability.
- Type and validate optional project file read allowMissing and exists fields from the stock server.
- Type and validate the optional pull request checks environment capability.
- Type and validate optional full upstream references in VCS list results.
- Type and validate the optional environment thread pinning capability.
- Type optional repositoryWebUrl metadata on direct thread pull request link commands.
- Type and validate the optional commandOutputStreaming environment capability.
- Type and validate the optional required worktree bootstrap capability in environment and configuration reads.
- Type optional observability trace endpoint metadata in configuration reads and snapshots.
- Type and validate the optional ignoredFileListing environment capability through existing environment and configuration metadata.
- Type optional provider icon metadata in configuration reads and streams.
- Expose optional Git failure reasons on GitCommandError RPC failure records.
- Type and validate optional repository origin remote URLs.
- Type optional recent event-loop stall metadata in server configuration reads and snapshots.
- Type and validate the optional storageCleanup environment capability.
- Type and validate optional thread-stop environment metadata.
- Type optional direct endpoint address hints in server configuration reads and snapshots.
- Type optional observability log export status on configuration reads.
- Expose optional metric export enabled metadata in configuration reads and snapshots.
- Type and validate the optional OTLP endpoint check environment capability.
- Type optional published theme version metadata in configuration reads and streams.
- Type and validate the optional threadAutoSettlement environment capability.
- Type optional workflow-script metadata on user-message turn items.
- Type optional provider error code metadata in thread shells.
- Type and validate the optional thread pin reorder environment capability.
- Type and validate the optional environment usage model aliases capability.
- Type and validate optional agent activity publishing environment metadata.
- Type optional blocking metadata on pending runtime request summaries.
- Type optional published theme palette variants in configuration reads and streams.
- Type and validate the optional terminal attach resume flag for stock T3 Code compatibility.
- Target stock T3 Code 0.1.2 and verify the client against its protocol 2 server.
- Require path: null for worktree creation so the server selects its managed worktree folder.
- Type and validate the optional pullRequests environment capability.
- Type and validate optional workspace slash-command discovery state.
- Type and validate the optional thread pull requests environment capability.
- Isolate live-test server commands from inherited T3 app service-launcher context.
- Type optional provider-turn prompt cache expiry metadata in thread reads and streams.
- Type optional published environment theme canvas seed colors.
- Type optional native fork head message metadata in provider-thread reads and events.
- Type and validate optional provider workspace option descriptors.
- Type optional idle compaction mode metadata in configuration reads and updates.
- Type and validate the optional thread pull request linking environment capability.
- Type and validate the optional project clone tracking capability in environment and configuration reads.
- Decode null subagent progress from stock server projections.
- Type and validate the optional environment theme capability flag.
- Type optional auto-compaction threshold metadata on provider-turn usage.
- Type and validate the optional thread title regeneration environment capability.
- Type and validate the optional usage price overrides environment capability.
- Type optional bot identity metadata on linked pull request snapshot authors.
- Type optional workflow-agent completion timestamps in thread reads and subagent updates.
- Type and validate optional server update thread continuation capability metadata.
- Type and validate optional server self-update progress capability metadata.
- Type optional provider setup documentation metadata in configuration reads and streams.
- Type and validate optional storageCleanupRun environment metadata.
- Type optional provider authentication action metadata in configuration reads and streams.
- Expose optional trace export enabled metadata in configuration reads and snapshots.
- Type optional repository URL metadata on nested pull request watch links.
- Type optional provider configurability metadata in configuration reads and streams.
- Type and validate the optional thread snooze environment capability.
- Type and validate the optional desktopAppUpdate environment capability.
- Type optional environment theme accent colors in configuration and theme streams.
- Type and validate optional pull request stack actions capability metadata.
- Type and validate the optional project settings overrides environment capability.
- Type optional repository web URL metadata on thread pull request links.
- Type and validate optional server self-update metadata while preserving future update paths.
- Type optional approval-request reason metadata in thread reads and events.
- Expose optional local tracing enabled metadata in configuration reads and snapshots.
- Type optional published theme colors with stock palette key and trimmed value validation.
- Type optional parent task metadata on pending background work.

## 0.1.0

### Features

- Provide the independently released T3 Code TypeScript library as @wyrd-company/t3code-lib with shared server profiles, pluggable credential sources, a runtime server target and generated public API reference.
  
  Publish the stock-server library contract as linked Refinery technical designs.
  
  Distinguish profile configuration and credential storage failures from server transport failures with a stable storage error code.
  
  Decode stock void RPC success payloads without exposing null to callers.
