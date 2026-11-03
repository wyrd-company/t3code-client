---
t3c-docs: patch
t3code-cli: patch
t3code-lib: minor
t3code-mcp: patch
t3mcp-docs: patch
---

Add the workspace methods `terminal.clear`, `terminal.observe`, `subscribeTerminalMetadata`, `vcs.init`, `vcs.pull`, `git.runStackedAction`, `git.resolvePullRequest`, `git.preparePullRequestThread`, `review.getBranchCommits`, `review.getDiffPreview` and `review.getDiffFileContents`. `subscribeVcsStatus` takes `includeRemote`, local status reports `branchChanges`, and `RpcErrorRecord` decodes the `Vcs*` process failures. `schemas.git` and `schemas.review` hold the new types.
