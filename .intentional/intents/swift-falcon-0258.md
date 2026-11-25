---
t3code-lib: patch
---

`T3HttpError.retryAfter` exposes the `Retry-After` header as sent, including on startup 503s and workflow-hook 429s. Parse the startup body with `schemas.httpErrors.ServerStartupStatus` and webhook refusal bodies with `schemas.workflow.WebhookFailure` for the error and optional problem detail.
