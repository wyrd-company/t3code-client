/**
 * Public surface of @wyrd-company/t3code-client. Everything a consumer may
 * import comes from here; internal modules are not part of the contract.
 */
export { T3Client, type T3ClientOptions } from "./client.ts";

export {
  T3Error,
  T3HttpError,
  T3AuthError,
  T3NotFoundError,
  T3RpcError,
  T3RpcDefectError,
  T3ConnectionError,
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
  ThreadListOptions,
  ThreadMetaUpdate,
  WatchOptions,
} from "./api/threads.ts";
export type { StartTurnInput, TurnHandle, TurnOutcome } from "./api/turns.ts";
export { ShellApi, type ShellWatchItem, type ShellWatchOptions } from "./api/shell.ts";
export { ServerApi } from "./api/server.ts";
export type { WatchServerConfigOptions, WatchServerLifecycleOptions } from "./api/server.ts";
export { VcsApi } from "./api/vcs.ts";
export { TerminalApi } from "./api/terminal.ts";
export type { DecodedStreamItem } from "./api/streamItems.ts";
export { CommandDispatcher } from "./api/dispatch.ts";
export {
  applyThreadEvent,
  pendingRequests,
  settledTurnStateForSessionStatus,
  threadPhase,
  type PendingRequest,
  type ThreadPhase,
  type SettledTurnState,
} from "./api/threadProjection.ts";
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
  TurnId,
  EventId,
  ApprovalRequestId,
  AuthSessionId,
  ProviderInstanceId,
} from "./schemas/common.ts";
export {
  threadId,
  projectId,
  commandId,
  messageId,
  turnId,
  eventId,
  approvalRequestId,
  authSessionId,
  providerInstanceId,
} from "./schemas/common.ts";
export type {
  OrchestrationThread,
  OrchestrationMessage,
  OrchestrationThreadDetailSnapshot,
  OrchestrationThreadActivity,
  OrchestrationLatestTurn,
  OrchestrationSession,
} from "./schemas/orchestration/readModel.ts";
export type {
  OrchestrationProjectShell,
  OrchestrationThreadShell,
  OrchestrationShellSnapshot,
} from "./schemas/orchestration/shell.ts";
export type { OrchestrationEvent } from "./schemas/orchestration/events.ts";
export type { ClientOrchestrationCommand } from "./schemas/orchestration/commands.ts";
export type { DispatchResult } from "./schemas/orchestration/stream.ts";
export type {
  ModelSelection,
  RuntimeMode,
  ProviderInteractionMode,
  ProviderApprovalDecision,
  ChatAttachment,
} from "./schemas/orchestration/model.ts";
export type {
  KnownThreadActivity,
  UnknownThreadActivity,
  ThreadActivityKind,
  ThreadActivityOfKind,
  ThreadActivityPayload,
} from "./schemas/orchestration/threadActivity.ts";
export { isThreadActivityOfKind } from "./schemas/orchestration/threadActivity.ts";
export type { ContextWindowUpdatedActivityPayload } from "./schemas/orchestration/activityPayloads/runtime.ts";
export type {
  ApprovalRequestedPayload,
  UserInputRequestedPayload,
  UserInputQuestion,
} from "./schemas/orchestration/activities.ts";
export type {
  ProviderUserInputAnswer,
  ProviderUserInputAnswers,
} from "./schemas/orchestration/model.ts";
export type {
  RpcErrorRecord,
  KnownRpcErrorRecord,
  UnknownRpcErrorRecord,
  RpcErrorTag,
  RpcErrorOfTag,
} from "./schemas/rpcErrors.ts";
export { isRpcErrorOfTag } from "./schemas/rpcErrors.ts";
