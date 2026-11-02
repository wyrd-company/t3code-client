---
t3c-docs: patch
t3code-cli: patch
t3code-lib: minor
t3code-mcp: patch
t3mcp-docs: patch
---

Add the T3 Code 0.1.6 orchestration reads and force stop: `threads.forceStop`, `shell.threadFamily`, `shell.worktreeThreadIds`, `shell.olderSettledThreads`. `shell.snapshot` and `shell.watch` accept `omitIdleSubagents` and `omitOlderSettled`, and snapshots carry `olderSettled`. `threads.search` accepts `olderSettledBefore`, `projectIds`, `environmentLabel` and `titlesOnly`, and its results carry `snapshotSequence`, `threads` and match `quality`, `hits` and `messageId`. `ServerConfig` exposes `shellThreadFamilies` and `shellOlderSettled`.
