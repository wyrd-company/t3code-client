---
t3c-docs: patch
t3code-cli: patch
t3code-lib: minor
t3code-mcp: patch
t3mcp-docs: patch
---

Add the pull request read methods `pullRequests.list`, `listStats`, `filterOptions`, `summary`, `routing`, `routingIdentity`, `stack`, `linkedThreads`, `detail`, `preview`, `checks`, `activity`, `reviewGuide`, `threadComments`, `diffFileContents`, `filesViewed`, `changeBreakdown`, `reviewerCandidates`, `labelCandidates` and `subscribeRefreshes`, and the `pullRequests.diff` route. `schemas.pullRequests` holds the new types, and `PullRequestUnavailableError` and `PullRequestOperationError` join the RPC error record.
