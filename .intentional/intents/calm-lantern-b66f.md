---
t3code-lib: minor
---

Target stock T3 Code 0.1.13 with orchestration protocol 2. Read workspace provider mode limits with `server.getProviderRuntimeModeLimits` and find workflow runs and open questions by subject with `workflows.about`. Existing `issues.detail` calls still accept an `IssueRef`; use `IssueDetailInput` when passing the optional `refresh: true` to read from the tracker. For tag-based HTTP error handling, accept HTTP 503 for issue tracker and pull request operation errors. Read terminal paste phases, conditional writes and replay fields, explicit queued runs, and push-hook approval details.
