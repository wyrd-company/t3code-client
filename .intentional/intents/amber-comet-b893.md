---
t3code-lib: minor
---

Request structured run output with `threads.startTurn` with `outputSchema` or `message.dispatch`. The thread projection records `run.output-submitted` and keeps the submitted output through later lifecycle events. Snapshots also expose workflow-step lineage, rollback repositories left unrestored, attempt modes, provider startup and dropped prompts, and tool background-wait support. Feedback cards appear in thread turn items and are answered through `agentFeedback.answerRequest`. Multi-field secret cards still appear in the pending runtime request summary.
