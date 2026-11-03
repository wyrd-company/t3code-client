---
t3c-docs: patch
t3code-cli: patch
t3code-lib: minor
t3code-mcp: patch
t3mcp-docs: patch
---

Add the MCP OAuth routes `mcpOAuth.protectedResource`, `mcpProtectedResource`, `authorizationServer`, `register`, `authorize`, `approval`, `decision` and `token`. A route with `redirectResponse` does not follow a redirect, and answers with `{ location }`. `schemas.authMcp` holds their shapes.
