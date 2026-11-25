---
t3code-lib: minor
---

Target stock T3 Code 0.1.12 with orchestration protocol 2. Type the new workspace folder, durable workflow, linked-environment thread and pairing, MCP server sign-in and agent feedback RPC methods, the MCP OAuth revoke route, and the run a workflow hook answers. Read tracked project folders, a run's output schema and output (`run.output-submitted`), feedback and multi-value secret cards, issue tracker accounts, pull request visibility, http usage limit sources, the preview viewer's select menu, and the new server, settings and capability fields. `threads.startTurn` accepts `outputSchema`, and the projects facade sends tracked folders. `T3HttpError.retryAfter` carries a refusal's `Retry-After`, as a starting server and a busy workflow hook send it, and `schemas.workflow.WebhookFailure` reads a webhook endpoint's refusal, a workflow hook's `problem` included.

Branch, ref and remote names now keep Unicode whitespace such as U+00A0 at their edges, as 0.1.12 does: `schemas.common.GitRefName` trims only ASCII whitespace. The client also advertises `httpUsageLimitSources`, so a 0.1.12 server includes `http` usage limit sources in the settings it sends. Scope rules that 0.1.12 adds to methods 0.1.11 already served are left to the server, so this client does not refuse a call an older server accepts.
