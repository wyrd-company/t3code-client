// ---
// relationships:
//   implements: library
// ---
/**
 * A project's folders and the task folders of its worktree threads (`workspaceFolders.ts`): the
 * folders a project tracks, a folder scan, a thread's task folder and the project's
 * `worktreeLayout` commands with their approvals.
 */
import { z } from "zod";
import { ProjectId, ThreadId, TrimmedNonEmptyString, forwardCompatibleLiteral } from "./common.ts";

/** `git` folders are repositories with their own history; `plain` folders are only files. */
export const WorkspaceFolderState = forwardCompatibleLiteral(["git", "plain", "missing"]);
export type WorkspaceFolderState = z.infer<typeof WorkspaceFolderState>;

export const WorkspaceFolder = z.looseObject({
  name: TrimmedNonEmptyString,
  path: TrimmedNonEmptyString,
  state: WorkspaceFolderState,
  /** Found inside the project folder by the server, not added by someone. */
  discovered: z.boolean().optional(),
});
export type WorkspaceFolder = z.infer<typeof WorkspaceFolder>;

export const WorkspaceListFoldersInput = z.looseObject({ projectId: ProjectId });
export type WorkspaceListFoldersInput = z.infer<typeof WorkspaceListFoldersInput>;

export const WorkspaceListFoldersResult = z.looseObject({
  /** The repositories found inside the project folder now, then the folders someone added. */
  folders: z.array(WorkspaceFolder),
});
export type WorkspaceListFoldersResult = z.infer<typeof WorkspaceListFoldersResult>;

export const WorkspaceScanFoldersInput = z.looseObject({ workspaceRoot: TrimmedNonEmptyString });
export type WorkspaceScanFoldersInput = z.infer<typeof WorkspaceScanFoldersInput>;

export const WorkspaceScannedFolder = z.looseObject({
  /** Absolute path on the environment. */
  path: TrimmedNonEmptyString,
  name: TrimmedNonEmptyString,
  isGitRepository: z.boolean(),
  /** `child` sits one level under the scanned folder; `code-workspace` came from that file. */
  source: forwardCompatibleLiteral(["child", "code-workspace"]),
});
export type WorkspaceScannedFolder = z.infer<typeof WorkspaceScannedFolder>;

export const WorkspaceScanFoldersResult = z.looseObject({
  /** Resolved path of the scanned folder. */
  workspaceRoot: TrimmedNonEmptyString,
  isGitRepository: z.boolean(),
  /** The `.code-workspace` file the listed folders came from, when one was read. */
  codeWorkspaceFile: TrimmedNonEmptyString.nullable(),
  folders: z.array(WorkspaceScannedFolder),
});
export type WorkspaceScanFoldersResult = z.infer<typeof WorkspaceScanFoldersResult>;

/** A new worktree thread isolates every tracked repository by default only up to this many. */
export const TASK_FOLDER_DEFAULT_REPOSITORIES_MAX = 8;

/** A tracked repository's own worktree inside a thread's task folder. */
export const TaskFolderRepository = z.looseObject({
  /** The tracked folder's path, as the project stores it. */
  repositoryPath: TrimmedNonEmptyString,
  worktreePath: TrimmedNonEmptyString,
  name: TrimmedNonEmptyString,
});
export type TaskFolderRepository = z.infer<typeof TaskFolderRepository>;

/**
 * The folder a worktree thread of a multi-repository project works in: the project folder and
 * each chosen repository at the same relative places, every repository on the thread's branch.
 */
export const TaskFolder = z.looseObject({
  root: TrimmedNonEmptyString,
  projectId: ProjectId,
  /** The project folder this was laid out from. */
  projectRoot: TrimmedNonEmptyString,
  /** The folder `root` stands in for: a path below it sits at the same place below `root`. */
  anchor: TrimmedNonEmptyString,
  /** Where the project folder sits inside `root`: the thread's `worktreePath`. */
  projectPath: TrimmedNonEmptyString,
  /** False when the project folder is not a repository: `projectPath` then links to its files. */
  projectIsWorktree: z.boolean(),
  repositories: z.array(TaskFolderRepository),
});
export type TaskFolder = z.infer<typeof TaskFolder>;

export const WorkspaceTaskFolderInput = z.looseObject({
  /** A thread's `worktreePath`, or any path inside its task folder. */
  worktreePath: TrimmedNonEmptyString,
});
export type WorkspaceTaskFolderInput = z.infer<typeof WorkspaceTaskFolderInput>;

export const WorkspaceTaskFolderResult = z.looseObject({
  /** Null for a thread whose worktree is a single checkout. */
  taskFolder: TaskFolder.nullable(),
});
export type WorkspaceTaskFolderResult = z.infer<typeof WorkspaceTaskFolderResult>;

export const WorkspaceAddTaskFolderRepositoryInput = z.looseObject({
  threadId: ThreadId,
  /** One of the project's tracked Git folders. */
  repositoryPath: TrimmedNonEmptyString,
});
export type WorkspaceAddTaskFolderRepositoryInput = z.infer<
  typeof WorkspaceAddTaskFolderRepositoryInput
>;

export const WorktreeLayoutCommandKind = z.enum(["create", "remove"]);
export type WorktreeLayoutCommandKind = z.infer<typeof WorktreeLayoutCommandKind>;

/** One of a project's `worktreeLayout` commands, as its `t3.json` holds it now. */
export const WorktreeLayoutCommand = z.looseObject({
  kind: forwardCompatibleLiteral(["create", "remove"]),
  command: z.string(),
  /** A person approved this exact text for this project. */
  approved: z.boolean(),
});
export type WorktreeLayoutCommand = z.infer<typeof WorktreeLayoutCommand>;

export const WorkspaceLayoutCommandsInput = z.looseObject({ projectId: ProjectId });
export type WorkspaceLayoutCommandsInput = z.infer<typeof WorkspaceLayoutCommandsInput>;

export const WorkspaceLayoutCommandsResult = z.looseObject({
  /** Empty for a project that declares no `worktreeLayout`. */
  commands: z.array(WorktreeLayoutCommand),
});
export type WorkspaceLayoutCommandsResult = z.infer<typeof WorkspaceLayoutCommandsResult>;

export const WorkspaceApproveLayoutCommandsInput = z.looseObject({
  projectId: ProjectId,
  approvals: z.array(
    z.looseObject({
      kind: WorktreeLayoutCommandKind,
      /** The text the person was shown, so a file that changed since is not approved unseen. Null withdraws the approval. */
      command: z.string().max(4096).nullable(),
    }),
  ),
});
export type WorkspaceApproveLayoutCommandsInput = z.infer<
  typeof WorkspaceApproveLayoutCommandsInput
>;
