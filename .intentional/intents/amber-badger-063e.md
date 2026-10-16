---
t3code-client: minor
---

The socket uses the ws package by default when it is installed, a new optional peer dependency, and the built-in WebSocket otherwise, so shell and thread snapshots over 4 MiB arrive on Node builds whose built-in WebSocket caps compressed messages. A message over the size limit fails in-flight work with the new T3ConnectionError reason message_too_large; a thread or shell watch whose fresh subscription fails that way ends with the error instead of resubscribing forever.
