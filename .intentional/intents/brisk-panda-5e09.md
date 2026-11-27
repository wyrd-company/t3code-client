---
t3code-lib: major
---

On stock T3 Code 0.1.13, HTTP responses tagged `IssueOperationError`, `IssueTrackerConnectionError` or `PullRequestOperationError` use status 503 instead of 502. Match the error tag and accept both statuses if you support older servers.
