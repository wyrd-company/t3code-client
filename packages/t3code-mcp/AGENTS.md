---
relationships:
  references: [mcp, automation-capabilities, library, testing, releasing]
---

# Complementary MCP server

Read `docs/technical-designs/mcp.yml` and `automation-capabilities.yml` at the
repository root. This package composes the library and official MCP SDK.

- Expose the complementary tool inventory. Stock T3 Code MCP provides schedule
  CRUD, ordinary launches, cross-thread search and user-question responses.
- Use shared `ProfileManager` connection inputs. Keep credentials in the library
  stores and preserve upstream permission scopes.
- Keep stdout for MCP protocol messages. Error text is fixed and does not echo
  upstream bodies, configuration values or credentials. Endpoint and delivery
  tools return the data their caller explicitly requested.
- Forward cancellation. Close initialized and initializing clients on shutdown.
- Use ESM/NodeNext, `.ts` relative imports, no `any`, colocated unit tests and
  SDK-client protocol tests. Only test and build tools spawn processes.
- Run the workspace `task check` before handoff. Add the package's single initial
  minor intent through Intentional. Publication requires explicit user approval.
