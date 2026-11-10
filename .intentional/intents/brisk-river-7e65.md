---
t3code-cli: minor
---

Add `--thread-mode new_thread|continue|fresh_session` to `t3c schedule create` and `update`, and `threadMode` to their JSON input. `fresh_session` keeps one thread and starts each later run in a new provider session. `t3c schedule show` prints the mode and the thread on its `thread` line, with `-` before a one-thread task's first run.
