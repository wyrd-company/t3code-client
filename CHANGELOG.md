# Changelog

## 0.6.0

### Features

- The socket uses the ws package by default when it is installed, a new optional peer dependency, and the built-in WebSocket otherwise, so shell and thread snapshots over 4 MiB arrive on Node builds whose built-in WebSocket caps compressed messages. A message over the size limit fails in-flight work with the new T3ConnectionError reason message_too_large; a thread or shell watch whose fresh subscription fails that way ends with the error instead of resubscribing forever.
- New: threads.transcript reads a thread's visible timeline over GET /api/orchestration/threads/:threadId/transcript, and its thread_transcript_too_large request error. The thread.pull-request-link-updated event decodes and replaces the matching pull request link in a watched thread. Environment capabilities decode projectWorktreeCleanup, settledWorktreeCleanup, and threadAutoSettlementScope.
- Target T3 Code 0.1.0 (orchestration protocol 2). The schemas, RPC registry, and facades now mirror the V2 orchestration contract: threads carry runs and turn items instead of session turns and activities, a turn is one run, commands are dispatched as OrchestrationV2Command over the socket only, projects are mutated through projects.mutate, the shell snapshot carries archived threads, the socket upgrade and orchestration HTTP routes name protocol 2, and auth decodes the granular permissions. New: threads.launch, threads.projection, threads.historyPage, threads.stop, threads.setModelSelection, shell.archivedSnapshot, shell.watchArchived, projects.snapshot. Removed by the server: shell.readModel, the HTTP dispatch fallback, the reasoningMessages opt-in, and thread.turn.start bootstrap (use threads.launch).
- Follow the T3 Code changes that lead to 0.1.0. New typed RPC methods: orchestration.stopWorkflow, orchestration.searchThread, orchestration.searchThreadStream, and the MCP Apps methods mcpApps.callTool, mcpApps.toolInfo, mcpApps.readResource, and mcpApps.updateModelContext, with their error records. New schema fields: workflow runs on subagents, the subagent.stop command, workspaceStrategy on delegated_task.request, delegatedTaskId on runs, the system notification source, initialAnswer on questions, promptCacheTtlMs on token usage, lastSnoozeWakeAt on threads, workspaceId and updateRequiredModels on providers, and threadFind flags on the server config. The thread watch accepts acceptCompactTurnItems and restores the omitted turn items; boundedSnapshotProjection does the same for other readers. threads.historyPage takes throughEntryId and view options. projects.mutate checks settings:write locally when a mutation carries scripts. Source control provider kinds are an open slug. Working-tree file paths keep leading and trailing spaces.

### Fixes

- An access token set with auth.setAccessToken keeps the whole permission grant, so granular permissions such as filesystem:read pass the local scope check. AuthLegacyScopes lists the full legacy vocabulary, including orchestration:read, orchestration:operate, terminal:operate, and review:write. threads.interrupt and threads.stop target the run that is executing, not a queued run behind it. A thread that holds only a legacy linkedPullRequest keeps that link when a pull request link update arrives. A thread watch announces a user-input request once its questions are known, so user-input-requested no longer arrives with an empty question list.

## 0.5.0

### Features

- Expose reconnect backoff, heartbeat, and optional socket open timeout; keep thread and shell watches retrying transient connection failures; add shell.readModel() for the full orchestration snapshot.

## 0.4.0

### Features

- Target T3 Code 0.0.45: type projects.ensureScratch and projects.createNew and expose them as projects.ensureScratch() and projects.createNew(). Mirror the new ServerConfig scratchWorkspaceRoot and newProjectsRoot fields, the usage-limits credentialFingerprint, and the fresh flag on server.refreshProviders.

## 0.3.0

### Features

- Target T3 Code 0.0.44: the client is verified against 0.0.44; the release changes no wire contract the client mirrors.

## 0.2.0

### Features

- Target T3 Code 0.0.43: mirror its schema changes (reasoning message role, thread.auto-settle.set command and event, autoSettleDisabledAt, monogram project icons, requireWorktree bootstrap, permission approvals, 100-attachment cap, new provider and environment fields). Add an opt-in reasoningMessages option to threads.watch, threads.detail, and threads.startTurn, off by default. A Lucide project icon that carries monogram text now decodes as `kind: "monogram"`; consumers that switch only on `lucide` and `emoji` must handle it.

## 0.1.0

### Features

- Publish `@wyrd-company/t3code-client` to npmjs: a TypeScript client for the stock T3 Code server covering the HTTP API, WebSocket RPC, and the auth control plane, tested against T3 Code 0.0.42.
