// ---
// relationships:
//   implements: library
// ---
import {
  TaskFolder,
  WorkspaceAddTaskFolderRepositoryInput,
  WorkspaceApproveLayoutCommandsInput,
  WorkspaceLayoutCommandsInput,
  WorkspaceLayoutCommandsResult,
  WorkspaceListFoldersInput,
  WorkspaceListFoldersResult,
  WorkspaceScanFoldersInput,
  WorkspaceScanFoldersResult,
  WorkspaceTaskFolderInput,
  WorkspaceTaskFolderResult,
} from "../../schemas/workspaceFolders.ts";
import { defineMethod } from "../spec.ts";

// Folder reads look at the host's files. Adding a repository creates a worktree, and approving a
// layout command lets the host run it, as a terminal does.
export const workspaceMethods = {
  "workspace.listFolders": defineMethod({
    payload: WorkspaceListFoldersInput,
    success: WorkspaceListFoldersResult,
    stream: false,
    scope: "filesystem:read",
  }),
  "workspace.scanFolders": defineMethod({
    payload: WorkspaceScanFoldersInput,
    success: WorkspaceScanFoldersResult,
    stream: false,
    scope: "filesystem:read",
  }),
  "workspace.taskFolder": defineMethod({
    payload: WorkspaceTaskFolderInput,
    success: WorkspaceTaskFolderResult,
    stream: false,
    scope: "filesystem:read",
  }),
  "workspace.addTaskFolderRepository": defineMethod({
    payload: WorkspaceAddTaskFolderRepositoryInput,
    success: TaskFolder,
    stream: false,
    scope: "source-control:write",
  }),
  /** The command text comes out of a file in the project folder. */
  "workspace.layoutCommands": defineMethod({
    payload: WorkspaceLayoutCommandsInput,
    success: WorkspaceLayoutCommandsResult,
    stream: false,
    scope: "filesystem:read",
  }),
  "workspace.approveLayoutCommands": defineMethod({
    payload: WorkspaceApproveLayoutCommandsInput,
    success: WorkspaceLayoutCommandsResult,
    stream: false,
    scope: "terminal:operate",
  }),
} as const;
