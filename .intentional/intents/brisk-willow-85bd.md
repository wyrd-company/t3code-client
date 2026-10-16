---
t3code-client: minor
---

New: threads.transcript reads a thread's visible timeline over GET /api/orchestration/threads/:threadId/transcript, and its thread_transcript_too_large request error. The thread.pull-request-link-updated event decodes and replaces the matching pull request link in a watched thread. Environment capabilities decode projectWorktreeCleanup, settledWorktreeCleanup, and threadAutoSettlementScope. The docs explain the 4 MiB compressed-message cap of some Node builds' built-in WebSocket and how to avoid it with the ws package.
