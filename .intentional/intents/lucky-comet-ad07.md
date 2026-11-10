---
t3c-docs: patch
t3code-lib: minor
---

Add `orchestration.getThreadTitles`, `orchestration.getThreadLinkMetadata` (config flag `threadLinkMetadata`), `orchestration.subscribePromptSuggestion`, `subscribeVcsBranch` and `vcs.refreshBranch`. `threads.startTurn` takes `freshContext`; runs read `freshContext` and `usageLimitContinuationOfRunId`, user messages read `freshContext`, and `message.dispatch` sends it. `thread.settle` sends `expectedLatestRunId`. `orchestration.subscribeShell` takes `httpSnapshotFallback` and streams `snapshot-required`. Provider sessions read `extensionStatuses`, provider turns read `model`, remote task children read `title`, and secret request items read `url`. `isDelegatedAppThread` names subagent and delegated threads. `schemas.orchestrationThreadReads` holds the new types.
