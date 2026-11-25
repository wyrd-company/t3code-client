---
t3code-lib: patch
---

On stock 0.1.12, a run can complete before its `checkpointId` arrives in a later `run.updated`. Wait for the checkpoint before requesting its patch. Queue slash commands as separate turns when another run is active. Guest thread reads omit file-change patch text. Refresh VCS status explicitly after `vcs.removeWorktree` if you rely on an immediate root-status refresh. Request `issues.list` with `sort: "created"` for creation-time order.
