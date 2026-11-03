// ---
// relationships:
//   implements: library
// ---
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
import type { z } from "zod";
import { isUnknownVariant, taggedUnionWithUnknown, type UnknownVariant } from "./common.ts";
import {
  ProjectListEntriesError,
  ProjectMutationError,
  ProjectReadFileError,
  ProjectSearchContentsError,
  ProjectSearchEntriesError,
  ProjectWriteFileError,
} from "./rpcErrors/projects.ts";
import {
  AuthAccessStreamError,
  EnvironmentAuthorizationError,
  KeybindingsConfigError,
  ProviderSetupError,
  AcpRegistryOperationError,
  ProviderUploadFeedbackError,
  SecretRequestError,
  ServerNpmReleaseError,
  ServerPrepareTriageError,
  ServerProviderUpdateError,
  ServerSettingsError,
  UsageLimitSourceError,
} from "./rpcErrors/server.ts";
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
  vcsRpcErrors,
} from "./rpcErrors/vcs.ts";
import {
  OrchestrationDispatchCommandError,
  OrchestrationGetFullThreadDiffError,
  OrchestrationGetTurnDiffError,
  OrchestrationGetWorkflowScriptError,
  OrchestrationSearchThreadsError,
  OrchestrationV2CommandOutputError,
  OrchestrationV2DispatchCommandError,
  OrchestrationV2ForceStopThreadError,
  OrchestrationV2GetShellSnapshotError,
  OrchestrationV2GetThreadProjectionError,
  OrchestrationV2SearchThreadError,
  OrchestrationV2StopWorkflowError,
  OrchestrationV2ThreadLaunchError,
} from "./rpcErrors/orchestration.ts";
import { GuestShareCreateError, PeerLinkError, PeerLinkRequestError } from "./rpcErrors/links.ts";
import { fileRpcErrors } from "./rpcErrors/files.ts";
import { McpAppRequestError } from "./rpcErrors/mcpApps.ts";
import { pullRequestRpcErrors } from "./rpcErrors/pullRequests.ts";
import { sourceControlRpcErrors } from "./rpcErrors/sourceControl.ts";
import { ScheduledTaskError, UsageReadError } from "./rpcErrors/automation.ts";

export * from "./rpcErrors/server.ts";
export * from "./rpcErrors/projects.ts";
export * from "./rpcErrors/terminal.ts";
export * from "./rpcErrors/vcs.ts";
export * from "./rpcErrors/orchestration.ts";
export * from "./rpcErrors/links.ts";
export * from "./rpcErrors/files.ts";
export * from "./rpcErrors/mcpApps.ts";
export * from "./rpcErrors/pullRequests.ts";
export * from "./rpcErrors/sourceControl.ts";
export * from "./rpcErrors/automation.ts";

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
  ...pullRequestRpcErrors,
  ...sourceControlRpcErrors,
  TextGenerationError,
  ...vcsRpcErrors,
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
  AcpRegistryOperationError,
  ProviderUploadFeedbackError,
  UsageLimitSourceError,
  ServerNpmReleaseError,
  ServerPrepareTriageError,
  ServerProviderUpdateError,
  SecretRequestError,
  PeerLinkError,
  PeerLinkRequestError,
  GuestShareCreateError,
  ProjectListEntriesError,
  ProjectSearchEntriesError,
  ProjectSearchContentsError,
  ProjectReadFileError,
  ProjectWriteFileError,
  ProjectMutationError,
  OrchestrationDispatchCommandError,
  OrchestrationV2DispatchCommandError,
  OrchestrationV2GetThreadProjectionError,
  OrchestrationV2GetShellSnapshotError,
  OrchestrationV2ThreadLaunchError,
  OrchestrationGetTurnDiffError,
  OrchestrationGetFullThreadDiffError,
  OrchestrationSearchThreadsError,
  OrchestrationGetWorkflowScriptError,
  OrchestrationV2StopWorkflowError,
  OrchestrationV2ForceStopThreadError,
  OrchestrationV2CommandOutputError,
  OrchestrationV2SearchThreadError,
  McpAppRequestError,
  ...fileRpcErrors,
  ScheduledTaskError,
  UsageReadError,
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

/** Narrow a decoded RPC failure to a recognized tagged error. */
export function isRpcErrorOfTag<const Tag extends RpcErrorTag>(
  record: RpcErrorRecord,
  tag: Tag,
): record is RpcErrorOfTag<Tag> {
  return !isUnknownVariant<"_tag">(record) && record._tag === tag;
}
