---
t3code-mcp: minor
t3mcp-docs: patch
---

Add the `thread_force_stop` tool. It force stops a thread whose agent ignored Stop, through `orchestration.forceStopThread`, and returns `outcome` (`killed`, `released`, `releasing` or `shared`) and `sharedWithThreadIds`. With `runId`, it fails with code `superseded` and stops nothing when another run is the latest.
