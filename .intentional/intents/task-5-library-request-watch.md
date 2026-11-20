---
t3c-docs: patch
t3code-lib: minor
---

Watch the approvals and questions every thread holds pending with `client.requests.watch`, a read-only `RequestsApi`: it reports each selected request it sees pending once per run, with `synchronized` after the start's reports and `reconnected` after each resync's, and filters by project, kind, exact thread id and tag. It covers threads created and archived while it runs, and requests raised during an outage that are still pending at the reconnect; requests already pending in archived threads at the start, and requests settled before it saw them, are not reported. `shell.watch` takes `httpSnapshotFallback`, which answers a gap the server cannot replay with `snapshot-required`. The published library reference in the t3c docs is regenerated.
