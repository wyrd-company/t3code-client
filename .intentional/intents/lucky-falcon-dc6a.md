---
t3code-lib: patch
---

Branch, ref and remote names preserve Unicode whitespace at their edges. Use `schemas.common.GitRefName` or `schemas.common.trimAsciiWhitespace` if you normalize names before sending, comparing or storing them.
