---
t3c-docs: patch
t3code-lib: minor
---

Use the read-only `client.requests.watch` API to report each selected approval or question it sees pending once per run, including during catch-up and after a reconnect. Select requests by project ID and kind (`approval` or `user-input`). Exclude threads by exact ID or tag. The watch yields `synchronized` after the initial reports and `reconnected` after each resync. It discovers active threads through shell rows and archived threads through removals. Reporting excludes requests already pending in archived threads at startup and requests that settle before the watch sees them pending. The watch can also miss requests from an archived thread it has yet to discover when the server cannot replay a removal. `shell.watch` takes `httpSnapshotFallback`, which answers a gap the server cannot replay with `snapshot-required`. The published library reference in the t3c docs is regenerated.
