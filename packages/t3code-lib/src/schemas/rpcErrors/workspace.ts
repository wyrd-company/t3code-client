// ---
// relationships:
//   implements: library
// ---
/** Tagged failures of the workspace folder methods, mirroring `workspaceFolders.ts`. */
import { z } from "zod";
import { forwardCompatibleLiteral } from "../common.ts";
import { Defect, taggedError } from "./shared.ts";

/** Its class derives `message` from `detail`, so only `detail` arrives. */
export const TaskFolderError = taggedError("TaskFolderError", {
  operation: forwardCompatibleLiteral([
    "plan",
    "create",
    "add-repository",
    "remove",
    "read",
    "approve",
  ]),
  detail: z.string(),
  cause: Defect.optional(),
});

export const WorkspaceFoldersError = taggedError("WorkspaceFoldersError", {
  operation: forwardCompatibleLiteral(["list", "scan"]),
  detail: z.string(),
});

export const workspaceRpcErrors = [TaskFolderError, WorkspaceFoldersError] as const;
