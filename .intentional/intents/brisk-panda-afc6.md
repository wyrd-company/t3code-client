---
t3c-docs: patch
t3code-lib: minor
---

Add typed thread tags: the `thread.tag.set` command, the `thread.tags-updated` event, and optional `tags` on threads, shells and projections (`schemas.orchestrationThreadTags` exports `ThreadTag` and `StoredThreadTags`). User-message turn items expose optional `modelSwitch`, and provider turn capabilities expose optional `activeSteeringAcceptsAttachments`.
