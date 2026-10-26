# Changelog

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
