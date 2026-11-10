---
t3code-mcp: minor
t3mcp-docs: patch
---

Add the read-only tools `thread_family` and `worktree_threads`. `thread_family` returns every active thread with the same root as a thread, in any run state, including forks and idle subagent children. `worktree_threads` returns the ids of the active threads on a worktree path, so an agent can check a worktree before it removes it.
