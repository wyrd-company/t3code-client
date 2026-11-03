---
t3c-docs: patch
t3code-cli: patch
t3code-lib: minor
t3code-mcp: patch
t3mcp-docs: patch
---

Add the source control methods `sourceControl.lookupRepository`, `sourceControl.cloneRepository`, `sourceControl.publishRepository`, `sourceControl.signInStart`, `sourceControl.signInWait`, `sourceControl.signInCancel`, `sourceControl.appAccess` and `sourceControl.starred`, the tracked clone methods `projectClone.start`, `projectClone.cancel`, `projectClone.retry` and `subscribeProjectClones`, and the agent session methods `agentSessions.scan` and `agentSessions.import`. `schemas.projectClone` and `schemas.agentSessions` hold the new types, and the failures of these methods join the RPC error record.
