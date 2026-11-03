// ---
// relationships:
//   implements: library
// ---
import { orchestrationMethods } from "./methods/orchestration.ts";
import { serverMethods } from "./methods/server.ts";
import { vcsMethods } from "./methods/vcs.ts";
import { projectsMethods } from "./methods/projects.ts";
import { terminalMethods } from "./methods/terminal.ts";
import { authAccessMethods } from "./methods/authAccess.ts";
import { peerLinksMethods } from "./methods/peerLinks.ts";
import { guestShareMethods } from "./methods/guestShare.ts";
import { mcpAppsMethods } from "./methods/mcpApps.ts";
import { scheduledTasksMethods } from "./methods/scheduledTasks.ts";
import { filesMethods } from "./methods/files.ts";
import { gitMethods } from "./methods/git.ts";
import { diagnosticsMethods } from "./methods/diagnostics.ts";
import { providerAuthMethods } from "./methods/providerAuth.ts";
import { providerInstallMethods } from "./methods/providerInstall.ts";
import { acpRegistryMethods } from "./methods/acpRegistry.ts";
import { sourceControlMethods } from "./methods/sourceControl.ts";
import { agentSessionsMethods } from "./methods/agentSessions.ts";
import { pullRequestsMethods } from "./methods/pullRequests.ts";

export const rpcMethods = {
  ...orchestrationMethods,
  ...serverMethods,
  ...vcsMethods,
  ...projectsMethods,
  ...terminalMethods,
  ...authAccessMethods,
  ...peerLinksMethods,
  ...guestShareMethods,
  ...mcpAppsMethods,
  ...scheduledTasksMethods,
  ...filesMethods,
  ...gitMethods,
  ...diagnosticsMethods,
  ...providerAuthMethods,
  ...providerInstallMethods,
  ...acpRegistryMethods,
  ...sourceControlMethods,
  ...agentSessionsMethods,
  ...pullRequestsMethods,
};
export type RpcMethods = typeof rpcMethods;
export type RpcMethodName = keyof RpcMethods;
