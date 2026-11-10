---
t3c-docs: patch
t3code-lib: minor
---

Scheduled tasks read and send `threadMode` (`new_thread`, `continue`, `fresh_session`). `scheduledTasks.update` with `threadId: null` and no mode sends `new_thread`, so the task leaves its thread on servers that keep a stored mode.
