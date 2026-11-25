---
t3code-lib: major
---

Update exhaustive handlers for the known `run.output-submitted` event, `feedback_request` turn item, preview viewer `selectMenu` and `selectMenuClosed` messages, and static keybinding commands `terminal.previous` and `terminal.next`. Include the new RPC error tags `TaskFolderError`, `WorkspaceFoldersError`, `WorkflowRequestError`, `PeerLinkThreadReadError`, `ProviderMcpSignInError`, `AgentFeedbackRequestError`, and `ExternalLauncherRevealTargetMissingError`. Exhaustive route and RPC tables also need `mcpOAuth.revoke` and the new methods.
