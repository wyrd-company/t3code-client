/**
 * The tagged failures the server's RPC methods declare in their `error`
 * schemas (`packages/contracts/src/rpc.ts`), as they arrive in an `Exit`
 * `Fail` cause. Each schema mirrors the contracts' `Schema.TaggedError`
 * fields. An error whose class overrides `message` with a getter does not
 * send `message` on the wire; only errors that declare it as a field carry it.
 *
 * `Schema.Defect()` fields (`cause`) encode whatever the server threw and
 * have no stable shape, so they stay `z.unknown()`.
 */
import { z } from "zod";
import { AuthGrantedScope } from "./auth.ts";
import {
  NonNegativeInt,
  PositiveInt,
  TrimmedNonEmptyString,
  forwardCompatibleLiteral,
  isUnknownVariant,
  taggedUnionWithUnknown,
  type UnknownVariant,
} from "./common.ts";
import { Defect, messageAndCause, taggedError } from "./rpcErrors/shared.ts";
import {
  TerminalCwdNotDirectoryError,
  TerminalCwdNotFoundError,
  TerminalCwdStatError,
  TerminalHistoryError,
  TerminalNotRunningError,
  TerminalProviderEnvironmentError,
  TerminalProviderInstanceNotFoundError,
  TerminalResizeError,
  TerminalSessionLookupError,
  TerminalWriteError,
} from "./rpcErrors/terminal.ts";
import {
  GitCommandError,
  GitManagerError,
  GitPullRequestMaterializationError,
  SourceControlProviderError,
  TextGenerationError,
} from "./rpcErrors/vcs.ts";

export * from "./rpcErrors/terminal.ts";
export * from "./rpcErrors/vcs.ts";

// auth.ts

export const EnvironmentAuthorizationError = taggedError("EnvironmentAuthorizationError", {
  message: z.string(),
  requiredScope: AuthGrantedScope,
});
export const AuthAccessStreamError = taggedError("AuthAccessStreamError", { message: z.string() });

// keybindings.ts, settings.ts, providerSetup.ts

/** The contracts class is `KeybindingsConfigError`; its wire tag is `KeybindingsConfigParseError`. */
export const KeybindingsConfigError = taggedError("KeybindingsConfigParseError", {
  configPath: z.string(),
  detail: z.string(),
  cause: Defect.optional(),
});
export const ServerSettingsOperation = forwardCompatibleLiteral([
  "normalize",
  "check-exists",
  "read-file",
  "read-provider-history",
  "read-project-settings",
  "read-secret",
  "remove-secret",
  "remove-stale-secret",
  "write-secret",
  "write-file",
  "prepare-directory",
]);
export const ServerSettingsError = taggedError("ServerSettingsError", {
  settingsPath: z.string(),
  operation: ServerSettingsOperation,
  providerInstanceId: z.string().optional(),
  environmentVariable: z.string().optional(),
  cause: Defect,
});
export const ProviderSetupError = taggedError("ProviderSetupError", {
  instanceId: z.string(),
  operation: z.string(),
  detail: z.string(),
  cause: Defect.optional(),
});

// project.ts

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

// orchestration.ts

export const OrchestrationDispatchCommandError = taggedError("OrchestrationDispatchCommandError", {
  ...messageAndCause,
  /** `deleted` when a failed bootstrap turn start removed the thread it created. */
  bootstrapThreadDisposition: forwardCompatibleLiteral(["deleted"]).optional(),
});
export const OrchestrationGetSnapshotError = taggedError(
  "OrchestrationGetSnapshotError",
  messageAndCause,
);
export const OrchestrationGetTurnDiffError = taggedError(
  "OrchestrationGetTurnDiffError",
  messageAndCause,
);
export const OrchestrationGetFullThreadDiffError = taggedError(
  "OrchestrationGetFullThreadDiffError",
  messageAndCause,
);
export const OrchestrationSearchThreadsError = taggedError(
  "OrchestrationSearchThreadsError",
  messageAndCause,
);
export const OrchestrationGetWorkflowScriptError = taggedError(
  "OrchestrationGetWorkflowScriptError",
  {
    reason: forwardCompatibleLiteral([
      "invalid-path",
      "root-unavailable",
      "not-found",
      "outside-root",
      "not-js",
      "not-regular-file",
      "changed-during-read",
      "read-failed",
    ]),
    scriptPath: z.string(),
    cause: Defect.optional(),
  },
);

/**
 * Every tagged failure a registered RPC method declares. A failure with an
 * unrecognised `_tag` decodes as `{ unknown: true, raw }`. Use
 * `decodeRpcErrorRecord` to decode without ever failing.
 */
export const RpcErrorRecord = taggedUnionWithUnknown("_tag", [
  EnvironmentAuthorizationError,
  AuthAccessStreamError,
  GitCommandError,
  GitManagerError,
  GitPullRequestMaterializationError,
  SourceControlProviderError,
  TextGenerationError,
  TerminalCwdNotFoundError,
  TerminalCwdNotDirectoryError,
  TerminalCwdStatError,
  TerminalHistoryError,
  TerminalSessionLookupError,
  TerminalProviderInstanceNotFoundError,
  TerminalProviderEnvironmentError,
  TerminalNotRunningError,
  TerminalWriteError,
  TerminalResizeError,
  KeybindingsConfigError,
  ServerSettingsError,
  ProviderSetupError,
  ProjectListEntriesError,
  ProjectSearchEntriesError,
  ProjectSearchContentsError,
  ProjectReadFileError,
  ProjectWriteFileError,
  OrchestrationDispatchCommandError,
  OrchestrationGetSnapshotError,
  OrchestrationGetTurnDiffError,
  OrchestrationGetFullThreadDiffError,
  OrchestrationSearchThreadsError,
  OrchestrationGetWorkflowScriptError,
]);
export type RpcErrorRecord = z.infer<typeof RpcErrorRecord>;
export type UnknownRpcErrorRecord = UnknownVariant<"_tag">;
export type KnownRpcErrorRecord = Exclude<RpcErrorRecord, UnknownRpcErrorRecord>;
export type RpcErrorTag = KnownRpcErrorRecord["_tag"];
export type RpcErrorOfTag<Tag extends RpcErrorTag> = Extract<KnownRpcErrorRecord, { _tag: Tag }>;

/**
 * Decode a failure record. Never throws: an unrecognised tag, or a recognised
 * tag whose fields do not match its schema, yields `{ unknown: true, raw }`.
 */
export function decodeRpcErrorRecord(
  raw: { readonly _tag: string } & Record<string, unknown>,
): RpcErrorRecord {
  const decoded = RpcErrorRecord.safeParse(raw);
  return decoded.success ? decoded.data : { unknown: true, raw: { ...raw } };
}

export function isRpcErrorOfTag<const Tag extends RpcErrorTag>(
  record: RpcErrorRecord,
  tag: Tag,
): record is RpcErrorOfTag<Tag> {
  return !isUnknownVariant<"_tag">(record) && record._tag === tag;
}
