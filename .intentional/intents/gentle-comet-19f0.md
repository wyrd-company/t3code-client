---
t3c-docs: patch
t3code-lib: major
---

For upgrades, `schemas.environment.ServerInstallation` changes from a Zod object to a union. If you use its `.shape` or `.extend()`, switch to parsing and narrowing the result with `schemas.environment.isT3LauncherInstallation`, or compose the union with another schema. A `t3-launcher` record requires both `launcher` and `baseDir`. Raw thread-stream consumers must handle `thread.visit-recorded` for visits from 0.1.10. Keep handling `thread.visited` for older servers. Update exhaustive consumers of typed events and errors for the new variants. Handle a 403 with reason `connect_approval_pending` as `T3HttpError` if you previously caught only `T3AuthError`. Changing `requireConnectDeviceApproval` requires `access:write`. Project file paths, checkpoint file paths and keybinding keys preserve whitespace. Provider sign-in URLs must start with `http://` or `https://`. On stock 0.1.10, launching a worktree with a missing plain base ref fails at launch before a preparation row appears. `shell.watch` keeps its cursor when a snapshot only refreshes project identities, so later replayed rows are still delivered.
