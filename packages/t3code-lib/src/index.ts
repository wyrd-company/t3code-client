// ---
// relationships:
//   implements: library
// ---
/**
 * Public surface of @wyrd-company/t3code-lib. Everything a consumer may
 * import comes from here; internal modules are not part of the contract.
 */
export { T3Client, type T3ClientOptions } from "./client.ts";
export type { BackoffPolicy } from "./internal/backoff.ts";

export {
  T3Error,
  T3HttpError,
  T3AuthError,
  T3NotFoundError,
  T3RpcError,
  T3RpcDefectError,
  T3ConnectionError,
  T3StorageError,
  T3DecodeError,
  T3PreconditionError,
  T3InterruptedError,
  T3TimeoutError,
  isT3Error,
  type T3ErrorCode,
  type T3ConnectionFailureReason,
  type T3HttpErrorDetails,
} from "./errors.ts";

export {
  memoryCredentialStore,
  fileCredentialStore,
  type CredentialStore,
  type StoredCredentials,
} from "./auth/credentialStore.ts";
export { AuthClient, type ExchangePairingTokenOptions } from "./auth/authClient.ts";
export * from "./auth/scopes.ts";
export { watchAccess } from "./auth/watchAccess.ts";

export { ProjectsApi } from "./api/projects.ts";
export type {
  ProjectCreateInput,
  ProjectEnsureInput,
  ProjectFilesApi,
  ProjectMetaUpdate,
} from "./api/projects.ts";
export { ThreadsApi } from "./api/threads.ts";
export type {
  ThreadCreateInput,
  ThreadLaunchInput,
  ThreadHistoryPageOptions,
  ThreadListOptions,
  ThreadMetaUpdate,
  WatchCommandOutputOptions,
  WatchOptions,
} from "./api/threads.ts";
export type {
  ApprovalResponseInput,
  InterruptOptions,
  UserInputDismissInput,
  UserInputResponseInput,
} from "./api/threadCommands.ts";
export type {
  CreationOrigin,
  StartTurnInput,
  TurnDelivery,
  TurnHandle,
  TurnOutcome,
} from "./api/turns.ts";
export {
  ShellApi,
  type ArchivedShellWatchItem,
  type ShellWatchItem,
  type ShellWatchOptions,
} from "./api/shell.ts";
export { ServerApi } from "./api/server.ts";
export type {
  WatchDatabaseStorageOptions,
  WatchServerConfigOptions,
  WatchServerLifecycleOptions,
} from "./api/server.ts";
export { VcsApi } from "./api/vcs.ts";
export { TerminalApi } from "./api/terminal.ts";
export type { DecodedStreamItem } from "./api/streamItems.ts";
export { CommandDispatcher } from "./api/dispatch.ts";
export {
  applyThreadEvent,
  assistantMessageForRun,
  pendingRequests,
  runOutcome,
  threadPhase,
  type PendingRequest,
  type ThreadPhase,
} from "./api/threadProjection.ts";
export { activeRun } from "./api/threadDerived.ts";
export {
  watchThread,
  type ThreadWatchItem,
  type ThreadWatchOptions,
  type ThreadDerivedItem,
} from "./api/threadWatch.ts";

export { RpcClient, type RpcClientOptions, type StreamItem } from "./rpc/client.ts";
export type { RpcStreamOptions } from "./transport/rpcConnection.ts";
export { rpcMethods, type RpcMethodName, type RpcMethods } from "./rpc/registry.ts";
export type {
  AuthEnvironmentScope,
  RpcMethodSpec,
  RpcMethodTable,
  RpcPayload,
  RpcSuccess,
  StreamMethodName,
  UnaryMethodName,
} from "./rpc/spec.ts";

export type { Logger } from "./internal/logger.ts";
export { consoleLogger } from "./internal/logger.ts";
export type { WebSocketConstructor, WebSocketLike } from "./internal/websocket.ts";

export * as schemas from "./schemas/index.ts";
export type {
  ThreadId,
  ProjectId,
  CommandId,
  MessageId,
  RunId,
  NodeId,
  TurnItemId,
  RuntimeRequestId,
  EventId,
  AuthSessionId,
  ProviderInstanceId,
} from "./schemas/common.ts";
export {
  threadId,
  projectId,
  commandId,
  messageId,
  runId,
  nodeId,
  turnItemId,
  runtimeRequestId,
  eventId,
  authSessionId,
  providerInstanceId,
} from "./schemas/common.ts";
export {
  ORCHESTRATION_PROTOCOL_HEADER,
  ORCHESTRATION_PROTOCOL_QUERY_PARAM,
  ORCHESTRATION_PROTOCOL_VERSION,
} from "./schemas/environment.ts";
export type {
  OrchestrationV2ThreadProjection,
  OrchestrationV2ThreadDetailSnapshot,
  OrchestrationV2ThreadBoundedSnapshot,
  OrchestrationV2ThreadHistoryPage,
  OrchestrationV2ThreadTranscript,
} from "./schemas/orchestration/projection.ts";
export type { OrchestrationV2AppThread } from "./schemas/orchestration/thread.ts";
export type {
  OrchestrationV2Run,
  OrchestrationV2RunStatus,
  OrchestrationV2RunTerminalStatus,
} from "./schemas/orchestration/runs.ts";
export { isRunActiveStatus, isRunTerminalStatus } from "./schemas/orchestration/runs.ts";
export type {
  OrchestrationV2ConversationMessage,
  OrchestrationV2UserInputQuestion,
} from "./schemas/orchestration/messages.ts";
export type { OrchestrationV2RuntimeRequest } from "./schemas/orchestration/providerState.ts";
export type {
  OrchestrationV2TurnItem,
  KnownOrchestrationV2TurnItem,
  OrchestrationV2TurnItemType,
  OrchestrationV2TurnItemOfType,
} from "./schemas/orchestration/turnItems.ts";
export { isTurnItemOfType } from "./schemas/orchestration/turnItems.ts";
export type {
  OrchestrationProjectShell,
  OrchestrationV2ThreadShell,
  OrchestrationV2ShellSnapshot,
} from "./schemas/orchestration/shell.ts";
export type {
  OrchestrationV2DomainEvent,
  KnownOrchestrationV2DomainEvent,
} from "./schemas/orchestration/events.ts";
export type {
  OrchestrationV2Command,
  OrchestrationV2CommandType,
  OrchestrationV2CommandOfType,
} from "./schemas/orchestration/commands.ts";
export type { DispatchResult } from "./schemas/orchestration/stream.ts";
export type { Project, ProjectMutation, ProjectUpdatePayload } from "./schemas/projects.ts";
export type {
  ModelSelection,
  RuntimeMode,
  ProviderInteractionMode,
  ProviderApprovalDecision,
  ProviderUserInputAnswer,
  ProviderUserInputAnswers,
  OrchestrationV2Actor,
  OrchestrationV2CreationSource,
} from "./schemas/orchestration/model.ts";
export type { ChatAttachment } from "./schemas/orchestration/attachments.ts";
export type {
  RpcErrorRecord,
  KnownRpcErrorRecord,
  UnknownRpcErrorRecord,
  RpcErrorTag,
  RpcErrorOfTag,
} from "./schemas/rpcErrors.ts";
export { isRpcErrorOfTag } from "./schemas/rpcErrors.ts";
export { TARGET_T3_CODE_VERSION } from "./version.ts";
export {
  ProfileManager,
  type ProfileManagerOptions,
  type ProfileResolveOptions,
  type ResolvedProfile,
  type CredentialSource,
} from "./profiles/profileManager.ts";
export type { Profile, ProfileConfig } from "./profiles/profileConfig.ts";
