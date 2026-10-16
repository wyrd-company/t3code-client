---
t3code-client: minor
---

New: threads.transcript reads a thread's visible timeline over GET /api/orchestration/threads/:threadId/transcript, and its thread_transcript_too_large request error. The thread.pull-request-link-updated event decodes and replaces the matching pull request link in a watched thread. Environment capabilities decode projectWorktreeCleanup, settledWorktreeCleanup, and threadAutoSettlementScope.
