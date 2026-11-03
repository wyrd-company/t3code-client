---
t3c-docs: patch
t3code-cli: patch
t3code-lib: minor
t3code-mcp: patch
t3mcp-docs: patch
---

Add the browser tab methods `preview.open`, `resize`, `adjust`, `close`, `list`, `clearProfile`, `reportProfiles`, `reportStatus` and `stopLocalServer`, and the streams `subscribePreviewEvents` and `subscribeDiscoveredLocalServers`. Add the routes `previewStream.download` and `previewStream.upload`, and `T3Client.openPreviewViewer` for the viewer socket of a tab in the server's browser. `schemas.preview` and `schemas.previewViewer` hold their shapes.
