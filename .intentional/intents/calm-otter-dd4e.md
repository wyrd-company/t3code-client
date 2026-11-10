---
t3c-docs: patch
t3code-cli: minor
t3code-lib: minor
t3code-mcp: minor
t3mcp-docs: patch
---

Add thread tags. The library adds `threads.setTag(threadId, tag, tagged)`, which sends `thread.tag.set` and returns the tags read back from the shell, and a `tag` filter on `threads.list`. `t3code-mcp` adds `thread_tag` and `tagged_threads` (bounded summaries, default 100, at most 500). `t3c` adds `thread tag <threadId> <tag> [--remove]` and `thread list --tag <tag>`. Tags match by exact spelling and case after trimming; the web client can hide tagged threads.
