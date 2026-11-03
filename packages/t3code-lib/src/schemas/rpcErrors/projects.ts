/** Tagged failures of the project RPC methods, mirroring the contracts' `project.ts`. */
import {
  CommandId,
  NonNegativeInt,
  PositiveInt,
  TrimmedNonEmptyString,
  forwardCompatibleLiteral,
} from "../common.ts";
import { messageAndCause, taggedError } from "./shared.ts";

export const ProjectEntriesFailure = forwardCompatibleLiteral([
  "workspace_root_not_found",
  "workspace_root_create_failed",
  "workspace_root_stat_failed",
  "workspace_root_not_directory",
  "search_index_create_failed",
  "search_index_scan_timed_out",
  "search_index_search_failed",
  "directory_list_failed",
]);
export const ProjectFileFailure = forwardCompatibleLiteral([
  "workspace_path_outside_root",
  "resolved_path_outside_root",
  "path_not_file",
  "binary_file",
  "operation_failed",
]);
export const ProjectFileOperation = forwardCompatibleLiteral([
  "realpath-workspace-root",
  "realpath-target",
  "open",
  "stat",
  "read",
  "close",
  "make-directory",
  "write-file",
]);

// The structured fields are optional on the wire so legacy message-only failures decode.
const projectEntriesFields = {
  cwd: TrimmedNonEmptyString.optional(),
  failure: ProjectEntriesFailure.optional(),
  normalizedCwd: TrimmedNonEmptyString.optional(),
  timeout: TrimmedNonEmptyString.optional(),
  detail: TrimmedNonEmptyString.optional(),
  ...messageAndCause,
};
const projectSearchFields = {
  ...projectEntriesFields,
  queryLength: NonNegativeInt.optional(),
  limit: PositiveInt.optional(),
};
const projectFileFields = {
  cwd: TrimmedNonEmptyString.optional(),
  relativePath: TrimmedNonEmptyString.optional(),
  failure: ProjectFileFailure.optional(),
  resolvedPath: TrimmedNonEmptyString.optional(),
  resolvedWorkspaceRoot: TrimmedNonEmptyString.optional(),
  operation: ProjectFileOperation.optional(),
  operationPath: TrimmedNonEmptyString.optional(),
  ...messageAndCause,
};
export const ProjectListEntriesError = taggedError("ProjectListEntriesError", projectEntriesFields);
export const ProjectSearchEntriesError = taggedError(
  "ProjectSearchEntriesError",
  projectSearchFields,
);
export const ProjectSearchContentsError = taggedError(
  "ProjectSearchContentsError",
  projectSearchFields,
);
export const ProjectReadFileError = taggedError("ProjectReadFileError", projectFileFields);
export const ProjectWriteFileError = taggedError("ProjectWriteFileError", projectFileFields);

export const ProjectMutationError = taggedError("ProjectMutationError", {
  commandId: CommandId,
  ...messageAndCause,
});
