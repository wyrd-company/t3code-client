---
relationships:
  references: [proxy, testing, releasing]
---

# Sender identity proxy

Read `docs/technical-designs/proxy.yml` at the repository root. It leads this code.

- The package is a service, with no public library API. It reads the wire protocol
  itself and has no runtime dependency on `@wyrd-company/t3code-lib`. Live tests
  may use the library as a client.
- `byline.ts` holds the text rules and `frames.ts` the rewrite table. `bridge.ts`
  and `upgrade.ts` own `/ws`. `service.ts` owns the listeners, HTTP forwarding and
  shutdown. `config.ts` owns the file and flags. `cliMain.ts` only reads options
  and starts the service.
- `ATTACHMENT_ONLY_PLACEHOLDER` matches upstream `ATTACHMENT_ONLY_BOOTSTRAP_PROMPT`.
  Each pinned `t3` update checks that text and looks for new commands that carry text.
- Logs go to stderr. They hold no message text, tokens, cookies, tickets, paths or
  queries. The log names a person, an RPC tag and a command type from the rewrite table.
- Application code does not spawn commands and has no pinned version check.
- Use ESM/NodeNext, `.ts` relative imports, no `any` and colocated tests.
- `test/live` runs in `task check` with no provider. `test/proof` needs real turns,
  HTTPS and a browser, so it runs only with `task proxy:test:proof`.
  `docs/technical-designs/testing.yml` has the needs and the manual client steps. Each
  pinned `t3` update reruns it.
- Run the workspace `task check` before handoff. Add consumer changes to the package's
  single initial minor intent. Publication requires explicit user approval.
