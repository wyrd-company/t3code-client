---
t3c-docs: patch
t3code-lib: minor
---

Target stock T3 Code 0.1.10, orchestration protocol 2: `TARGET_T3_CODE_VERSION` is `0.1.10`, and every client-facing change of 0.1.10 is typed. New are the `server.getSettings`, `server.checkSecretSource` and `pullRequests.subscribeLinkedThreadRefreshes` methods; the T3 Connect device routes `auth.approveConnectDevice` and `auth.revokeConnectDevice`, with `connectDevices` on the access snapshot and `connectDeviceRequest` on pairing links; `orchestration.shellSnapshotResume` for the shell snapshot's `resumeFrom`; the `thread.visit-recorded` event, which the thread projection applies; `userOnly` on pending request summaries, set on secret and link cards; provider status deltas (`applyServerProviderDeltas`); linked senders, steer follow-ups and title regeneration outcomes; fast-forward merges, overview threads, required rebases, merge queue removals and withheld file diffs on pull requests; and the new settings, capabilities and fields. The t3c library reference is updated.
