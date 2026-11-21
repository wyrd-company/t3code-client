---
t3c-docs: patch
t3code-lib: minor
---

Use the read-only `client.requests.watch` API to report each selected approval or question it sees pending once per run, including during catch-up and after a reconnect. Filter by project, kind, exact thread id or tag. The watch yields `synchronized` after the initial reports and `reconnected` after each resync. It discovers active threads through shell rows and archived threads through removals. An archived thread outside the watch's view can be missed when the server cannot replay a removal. Requests that settle before the watch sees them pending are outside its reporting window. `shell.watch` takes `httpSnapshotFallback`, which answers a gap the server cannot replay with `snapshot-required`. The published library reference in the t3c docs is regenerated.
