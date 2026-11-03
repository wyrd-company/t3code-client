---
t3c-docs: patch
t3code-cli: patch
t3code-lib: minor
t3code-mcp: patch
t3mcp-docs: patch
---

Add the file methods `filesystem.browse`, `filesystem.getMetadata`, `assets.createUrl`, `assets.persistChatAttachments`, `attachments.createUploadUrl`, `attachments.delete` and `shell.openInEditor`, and the signed routes `assets.read` (`GET /api/assets/*`) and `attachments.upload` (`POST /api/attachments/upload/*`). `assetUrlParams` and `attachmentUploadUrlParams` turn a `relativeUrl` into route params. `schemas.server.EditorId` names every editor of the target build.
