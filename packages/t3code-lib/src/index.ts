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
export {
  AuthClient,
  type ExchangePairingTokenOptions,
  type SetAccessTokenOptions,
} from "./auth/authClient.ts";
export { createDpopProof, generateDpopKey, type DpopProofInput } from "./auth/dpop.ts";
export {
  DESKTOP_BOOTSTRAP_TOKEN_WINDOW_MS,
  currentDesktopBootstrapToken,
} from "./auth/desktopBootstrap.ts";
export { HttpRouteClient, type HttpRouteClientOptions } from "./http/client.ts";
export type {
  PreviewViewer,
  PreviewViewerClose,
  PreviewViewerFrame,
  PreviewViewerOutput,
} from "./transport/previewViewer.ts";
export { httpRoutes, type HttpRouteName, type HttpRoutes } from "./http/registry.ts";
export { assetUrlParams, attachmentUploadUrlParams } from "./http/routes/assets.ts";
export type {
  HttpRouteAuth,
  HttpRouteInput,
  HttpRouteMethod,
  HttpRouteSpec,
  HttpRouteSuccess,
  HttpRouteTable,
} from "./http/spec.ts";
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
  ThreadPendingRequestCounts,
  ThreadProviderThreadUsage,
  ThreadProviderTurnUsage,
  ThreadStatus,
  ThreadUsage,
} from "./api/threadInspection.ts";
export {
  THREAD_SEARCH_MAX_LIMIT,
  latestDiffTurnCount,
  type ThreadContentSearchInput,
  type ThreadContentSearchResult,
  type ThreadDiff,
  type ThreadDiffRange,
  type ThreadSearchInput,
  type ThreadSearchResult,
} from "./api/threadDiffSearch.ts";
export type {
  ApprovalResponseInput,
  ForceStopThreadOptions,
  InterruptOptions,
  StopThreadOptions,
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
  type ShellOmitOptions,
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
export {
  ScheduledTasksApi,
  type ScheduledTaskPatch,
  type ScheduledTaskTarget,
  type ScheduledTasksApiOptions,
  type ScheduledTaskWebhookEndpointInfo,
  type WatchScheduledTasksOptions,
} from "./api/scheduledTasks.ts";
export { TerminalApi } from "./api/terminal.ts";
export { PeerLinksApi } from "./api/peerLinks.ts";
export { GuestSharesApi } from "./api/guestShares.ts";
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
export * from "./publicSchemas.ts";
export { TARGET_T3_CODE_VERSION } from "./version.ts";
export {
  ProfileManager,
  type ProfileManagerOptions,
  type ProfileResolveOptions,
  type ResolvedProfile,
  type CredentialSource,
} from "./profiles/profileManager.ts";
export type { Profile, ProfileConfig } from "./profiles/profileConfig.ts";
