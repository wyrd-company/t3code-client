---
t3code-mcp: minor
---

Name tool access kinds. `defineTool` takes a `ToolAccess` (`"read"`, `"destructive"` or `"idempotentWrite"`, now exported as a type) as its last argument and sets the MCP annotations from it; `idempotentWrite` marks a write that is neither destructive nor different when repeated. `true` and `false` still work as `"read"` and `"destructive"`.
