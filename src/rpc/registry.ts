// ---
// relationships:
//   implements: design
// ---
import { orchestrationMethods } from "./methods/orchestration.ts";
import { serverMethods } from "./methods/server.ts";
import { vcsMethods } from "./methods/vcs.ts";
import { projectsMethods } from "./methods/projects.ts";
import { terminalMethods } from "./methods/terminal.ts";
import { authAccessMethods } from "./methods/authAccess.ts";

export const rpcMethods = {
  ...orchestrationMethods,
  ...serverMethods,
  ...vcsMethods,
  ...projectsMethods,
  ...terminalMethods,
  ...authAccessMethods,
};
export type RpcMethods = typeof rpcMethods;
export type RpcMethodName = keyof RpcMethods;
