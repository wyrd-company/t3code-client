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
import { mcpAppsMethods } from "./methods/mcpApps.ts";
import { scheduledTasksMethods } from "./methods/scheduledTasks.ts";

export const rpcMethods = {
  ...orchestrationMethods,
  ...serverMethods,
  ...vcsMethods,
  ...projectsMethods,
  ...terminalMethods,
  ...authAccessMethods,
  ...mcpAppsMethods,
  ...scheduledTasksMethods,
};
export type RpcMethods = typeof rpcMethods;
export type RpcMethodName = keyof RpcMethods;
