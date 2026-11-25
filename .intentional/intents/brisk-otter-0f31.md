---
t3code-lib: major
---

The four `webhooks.webhook*` routes now return either `{ deliveryId }` for a scheduled-task hook or `{ runId }` for a durable-workflow hook. Before using either ID, narrow the result with `typeof result.deliveryId === "string"` or `typeof result.runId === "string"`. If you composed one of the route `success` schemas using object methods such as `.shape` or `.extend()`, compose the result union or use `schemas.scheduledTask.ScheduledTaskWebhookAccepted` and `schemas.workflow.WorkflowHookAccepted` individually.
