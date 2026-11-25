// ---
// relationships:
//   verifies: library
// ---
import { describe, expect, it } from "vite-plus/test";
import { rpcMethods } from "../rpc/registry.ts";
import { decodeRpcErrorRecord, isRpcErrorOfTag } from "./rpcErrors.ts";

const project = { projectId: "project-1" };
const taskFolder = {
  root: "/srv/worktrees/sample-task",
  projectId: "project-1",
  projectRoot: "/srv/sample",
  anchor: "/srv",
  projectPath: "/srv/worktrees/sample-task/sample",
  projectIsWorktree: true,
  repositories: [
    { repositoryPath: "/srv/lib", worktreePath: "/srv/worktrees/sample-task/lib", name: "lib" },
  ],
};

describe("workspace folder methods (0.1.12)", () => {
  it("lists a project's folders and scans a folder for repositories", () => {
    const list = rpcMethods["workspace.listFolders"];
    expect(list.payload.parse(project)).toEqual(project);
    const folders = [
      { name: "app", path: "/srv/sample/app", state: "git", discovered: true },
      { name: "docs", path: "/srv/docs", state: "plain" },
      { name: "gone", path: "/srv/gone", state: "missing" },
    ];
    expect(list.success.parse({ folders })).toEqual({ folders });
    expect(list.success.safeParse({ folders: [{ name: "app", path: "" }] }).success).toBe(false);

    const scan = rpcMethods["workspace.scanFolders"];
    expect(scan.payload.safeParse({ workspaceRoot: " " }).success).toBe(false);
    const result = {
      workspaceRoot: "/srv/sample",
      isGitRepository: false,
      codeWorkspaceFile: "/srv/sample/sample.code-workspace",
      folders: [{ path: "/srv/sample/lib", name: "lib", isGitRepository: true, source: "child" }],
    };
    expect(scan.success.parse(result)).toEqual(result);
    expect(scan.success.parse({ ...result, codeWorkspaceFile: null }).codeWorkspaceFile).toBeNull();
  });

  it("reads a thread's task folder and adds a repository to it", () => {
    const find = rpcMethods["workspace.taskFolder"];
    expect(find.payload.parse({ worktreePath: "/srv/worktrees/sample-task/sample" })).toEqual({
      worktreePath: "/srv/worktrees/sample-task/sample",
    });
    expect(find.success.parse({ taskFolder })).toEqual({ taskFolder });
    expect(find.success.parse({ taskFolder: null })).toEqual({ taskFolder: null });
    const add = rpcMethods["workspace.addTaskFolderRepository"];
    expect(add.payload.safeParse({ threadId: "thread-1" }).success).toBe(false);
    expect(add.payload.parse({ threadId: "thread-1", repositoryPath: "/srv/lib" })).toEqual({
      threadId: "thread-1",
      repositoryPath: "/srv/lib",
    });
    expect(add.success.parse(taskFolder)).toEqual(taskFolder);
  });

  it("reads layout commands and sends approvals of the exact text shown", () => {
    const commands = [
      { kind: "create", command: "./layout.sh create", approved: false },
      { kind: "remove", command: "./layout.sh remove", approved: true },
    ];
    expect(rpcMethods["workspace.layoutCommands"].success.parse({ commands })).toEqual({
      commands,
    });
    const approve = rpcMethods["workspace.approveLayoutCommands"];
    const input = {
      ...project,
      approvals: [
        { kind: "create", command: "./layout.sh create" },
        { kind: "remove", command: null },
      ],
    };
    expect(approve.payload.parse(input)).toEqual(input);
    for (const approval of [
      { kind: "rename", command: "x" },
      { kind: "create", command: "x".repeat(4097) },
    ]) {
      expect(approve.payload.safeParse({ ...project, approvals: [approval] }).success).toBe(false);
    }
  });

  it("decodes the task folder and folder listing failures", () => {
    const task = decodeRpcErrorRecord({
      _tag: "TaskFolderError",
      operation: "add-repository",
      detail: "The repository is not tracked.",
    });
    expect(isRpcErrorOfTag(task, "TaskFolderError") && task.detail).toBe(
      "The repository is not tracked.",
    );
    const folders = decodeRpcErrorRecord({
      _tag: "WorkspaceFoldersError",
      operation: "scan",
      detail: "Not a folder.",
    });
    expect(isRpcErrorOfTag(folders, "WorkspaceFoldersError")).toBe(true);
  });
});
