// ---
// relationships:
//   implements: library
// ---
/**
 * ThreadsApi: thread lifecycle commands with server bookkeeping filled in,
 * idempotent `ensure` keyed by the caller's thread id, launches, request
 * responses, turns, and the resumable live watch. Reads live in
 * `threadReads.ts`.
 */
import { T3PreconditionError, T3RpcError } from "../errors.ts";
import type { RpcClient } from "../rpc/client.ts";
import type { RpcMethods } from "../rpc/registry.ts";
import type { ProviderInstanceId, RunId, ThreadId } from "../schemas/common.ts";
import type { OrchestrationV2Command } from "../schemas/orchestration/commands.ts";
import type { ThreadMetadataUpdatePayload } from "../schemas/orchestration/commands/thread.ts";
import type {
  OrchestrationV2CommandOutputFrame,
  OrchestrationV2SubscribeCommandOutputInput,
} from "../schemas/orchestration/commandOutput.ts";
import type {
  ModelSelection,
  ProviderInteractionMode,
  RuntimeMode,
} from "../schemas/orchestration/model.ts";
import type {
  OrchestrationV2ThreadDetailSnapshot,
  OrchestrationV2ThreadHistoryPage,
  OrchestrationV2ThreadProjection,
  OrchestrationV2ThreadTranscript,
} from "../schemas/orchestration/projection.ts";
import type { OrchestrationV2ThreadShell } from "../schemas/orchestration/shell.ts";
import type {
  DispatchResult,
  OrchestrationV2ThreadLaunchResult,
} from "../schemas/orchestration/stream.ts";
import type { HttpTransport } from "../transport/http.ts";
import { watchCommandOutput, type WatchCommandOutputOptions } from "./commandOutput.ts";
import { isMissingResourceError, type CommandDispatcher } from "./dispatch.ts";
import {
  ThreadCommands,
  type ApprovalResponseInput,
  type InterruptOptions,
  type UserInputDismissInput,
  type UserInputResponseInput,
} from "./threadCommands.ts";
import {
  threadCreateCommand,
  threadLaunchPayload,
  type ThreadCreateInput,
  type ThreadLaunchInput,
} from "./threadCreation.ts";
import { activeRun } from "./threadDerived.ts";
import { findThreadByNativeSession } from "./threadSessionLookup.ts";
import {
  findThread,
  listThreads,
  loadThreadDetail,
  loadThreadHistoryPage,
  loadThreadTranscript,
  type ThreadHistoryPageOptions,
  type ThreadListOptions,
} from "./threadReads.ts";
import {
  pendingRequests,
  threadPhase,
  type PendingRequest,
  type ThreadPhase,
} from "./threadProjection.ts";
import type { DecodedStreamItem } from "./streamItems.ts";
import { startThreadTurn } from "./threadTurnStart.ts";
import { watchThread, type ThreadWatchItem, type ThreadWatchOptions } from "./threadWatch.ts";
import type { StartTurnInput, TurnHandle } from "./turns.ts";

export type { WatchCommandOutputOptions } from "./commandOutput.ts";
export type { ThreadCreateInput, ThreadLaunchInput } from "./threadCreation.ts";
export type { ThreadHistoryPageOptions, ThreadListOptions } from "./threadReads.ts";

export type ThreadMetaUpdate = ThreadMetadataUpdatePayload;

export type WatchOptions = Omit<ThreadWatchOptions, "snapshotLoader">;

/**
 * Thread lifecycle, history, runs and pending requests.
 * App-thread records expose optional nullable `lastSnoozeWakeAt` through detail,
 * projection and thread-state watch events. Timestamp strings and null survive;
 * omission stays absent and nonstring nonnull values fail decoding. Unknown
 * metadata survives. This field records a manual wake without changing sort order.
 * Pending background tasks expose optional `parentTaskId` through provider-thread
 * projections, detail snapshots, provider-thread events and thread shells. It
 * identifies the subagent task that started the work and waits on it. Values are
 * trimmed nonempty strings for every kind, including fallback kinds. Omission
 * stays absent, malformed values fail decoding and unknown metadata survives.
 * Reading this field does not start work or change completion policy.
 * Pending subagent tasks also expose optional `providerInstanceId` through these
 * reads and events. Derived shell work identifies the owning provider thread's
 * instance. Values are trimmed provider slugs: at most 64 characters, starting
 * with a letter, then letters, digits, hyphens or underscores. Omission stays
 * absent; malformed subagent values fail decoding. Other task kinds preserve
 * this key as unknown metadata. Reading it does not select a provider or start work.
 * Provider-thread native metadata exposes optional `forkHeadMessageId` through
 * projections, detail snapshots and provider-thread events. It identifies the
 * native message at a fork head. Strings are trimmed and must be nonempty;
 * omission stays absent, malformed values fail decoding and unknown metadata
 * survives. Reading this field does not create or resume a fork.
 * Subagent turn-item `progress` is an optional string or null through projections,
 * detail snapshots, visible rows and turn-item events. Strings and null survive;
 * omission stays absent and other values fail decoding. Null represents unavailable
 * progress in stock server projections. Reading it does not stop work or change policy.
 * Approval-request turn items expose optional `fullAccessOverride` through
 * projections, detail snapshots and turn-item events. Known values `ask_rule`
 * and `provider_check` describe why the provider requested approval in full-access
 * mode. Future strings survive; omission stays absent and nonstrings fail decoding.
 * Reading this metadata does not answer an approval or change permissions.
 *
 * Approval-request turn items expose optional string `reason` through projection,
 * detail and turn-item events. Empty and arbitrary strings are valid; omission
 * stays absent and malformed values fail decoding. Reading this metadata does
 * not answer an approval or change permissions.
 *
 * User-input question options expose optional string `preview` through projections,
 * detail snapshots and turn-item events. Empty and arbitrary strings are valid;
 * provider reports and older servers can omit it. Reading it does not answer the
 * question or change its response policy.
 *
 * Provider-thread context usage exposes optional `cost` in detail, projection
 * and provider-thread update events. Its amount is finite, including negative,
 * zero and fractional values; currency is trimmed, nonempty and at most 32
 * characters. Omission stays absent and unknown cost metadata survives.
 * Malformed values fail decoding. Reading cost does not price or convert usage.
 *
 * Linked pull request snapshot authors expose optional boolean `isBot` in
 * detail, projection and link-update events. True and false survive; omission
 * stays absent and unknown actor metadata survives. Malformed values fail
 * decoding. Reading this metadata does not change author permissions.
 *
 * Provider-turn token usage exposes optional positive integer `autoCompactThreshold`
 * through detail, projection and stream reads. It reports provider auto-compaction
 * metadata in tokens. Omission stays absent, malformed values fail decoding, and
 * unknown metadata survives. Reading it does not enforce compaction or change timing.
 * Provider-turn usage also exposes optional string `promptCacheExpiresAt` through
 * the same reads. It reports the provider's prompt cache expiry metadata. Empty
 * and other strings pass through; omission stays absent and malformed values fail
 * decoding. Reading the field does not expire a cache or schedule compaction.
 * `update` and `dispatch` accept optional nullable nonempty string `expectedBranch`
 * on metadata updates. The server rejects an update if its current branch differs;
 * null expects no branch, and omission leaves this precondition unsupplied.
 * String values are trimmed; malformed values fail before sending.
 * Linked pull requests expose optional nonempty string `repositoryWebUrl` metadata
 * in thread reads and link update events. It carries a browser or clone URL when
 * supplied; older links can omit it. Reading it does not fetch the repository.
 * Context transfers in projections, HTTP detail snapshots and context-transfer
 * events expose optional `sourceTokenUsage` with the provider-turn usage shape.
 * Native forks can retain source usage; older transfers and portable handoffs
 * can omit it. Nested usage is validated; unknown metadata survives. Reading it
 * does not enforce a context budget or perform a fork.
 *
 * Linked pull requests also expose optional `endedWatch` records in thread reads
 * and link-update events. The record uses the existing watch timestamps, nullable
 * head SHA, check/remark arrays, pass/conflict flags and wake count. Omission
 * stays absent; missing `passedChecks` defaults to an empty array. Malformed
 * records fail decoding, and unknown metadata survives. Reading it does not restart a watch.
 * `dispatch` accepts optional nonempty string `repositoryWebUrl` on
 * `thread.pull-request.link`: browser or clone URLs and other nonempty strings
 * pass through, omission leaves it unsupplied, and malformed values fail before sending.
 * Unknown command metadata survives; sending the field does not fetch a repository.
 * The optional `link` on `thread.pull-request.watch` also accepts optional
 * nonempty string `repositoryWebUrl`; omission and unknown metadata survive,
 * and malformed values fail before sending. This metadata does not change watch policy.
 * Projection conversation messages and user-message turn items in projections,
 * history/transcript rows and turn-item updates expose optional boolean `workflowScript`
 * metadata: true marks a provider-native workflow script, false marks ordinary
 * text, and older servers or other producers can omit it. Reading this metadata
 * does not execute a workflow or change message text.
 * Workflow agents in projection/detail reads and subagent updates expose optional
 * nonnegative integer `completedAt` epoch milliseconds. Zero and omission are
 * preserved, malformed values fail decoding, and unknown metadata survives.
 * Reading it does not change workflow completion.
 * `dispatch` accepts the `thread.stop` command with `commandId`, `threadId` and
 * an optional `reason` string. Any string reason passes unchanged, omission stays
 * absent, unknown command metadata survives, and malformed fields fail before
 * sending. Servers that accept it advertise `threadStop`; `dispatch` does not
 * check that flag. `stop` still sends `run.interrupt` with `holdQueue`.
 * `dispatch` also accepts the `queued-run.start` command with `commandId`,
 * `threadId` and `runId`. Ids use the same trimmed normalization as the other
 * queued-run commands, unknown command metadata survives, and malformed or
 * missing ids fail before sending. The server starts only a queued plain user
 * message on a stopped thread; otherwise it fails with
 * `OrchestrationV2DispatchCommandError`. No facade method sends it.
 *
 * `watchCommandOutput` follows `orchestration.subscribeCommandOutput` for one
 * `command_execution` row (`{ threadId, itemId }`, trimmed nonempty ids). Each
 * frame has `kind` (`replace` carries the bounded tail, `append` extends it;
 * future strings survive), terminal `text` with its escapes passed through
 * unchanged, `truncated` and `running`. All four fields are required and
 * unknown fields survive. The stream ends after a frame with `running: false`;
 * a settled row sends one `replace` frame. A malformed frame is delivered as a
 * decode error, recognised by its `error` being a `T3DecodeError` because a
 * frame's `kind` is an open string, and later frames continue. A missing
 * thread, a missing row or a row that is not a command fails with
 * `OrchestrationV2CommandOutputError`. Returning early or aborting the signal
 * ends the subscription; there is no resubscription. Servers that support it
 * advertise `commandOutputStreaming`; check that flag before subscribing on an
 * older server. The library does not render terminal output.
 */
export class ThreadsApi {
  readonly #commands: ThreadCommands;

  readonly http: HttpTransport;
  readonly rpc: RpcClient<RpcMethods>;
  readonly dispatcher: CommandDispatcher;

  constructor(http: HttpTransport, rpc: RpcClient<RpcMethods>, dispatcher: CommandDispatcher) {
    this.http = http;
    this.rpc = rpc;
    this.dispatcher = dispatcher;
    this.#commands = new ThreadCommands(dispatcher);
  }

  /**
   * Active threads from the shell; with `includeArchived`, archived threads
   * as well, read from the archived shell over RPC.
   */
  list(
    options: ThreadListOptions = {},
    signal?: AbortSignal,
  ): Promise<OrchestrationV2ThreadShell[]> {
    return listThreads(this.http, this.rpc, options, signal);
  }

  /** Active threads first; archived threads are consulted only when the id is not active. */
  get(threadId: ThreadId, signal?: AbortSignal): Promise<OrchestrationV2ThreadShell | undefined> {
    return findThread(this.http, this.rpc, threadId, signal);
  }

  /**
   * Resolve a provider instance and its native session id to a T3 Code thread id.
   * Searches active and archived threads, including earlier provider sessions.
   * Returns null only when no match exists; multiple matching threads raise
   * T3PreconditionError. Read and transport failures propagate. This reads the
   * shell and each thread projection; it does not resume or import a session.
   */
  findByNativeSession(
    providerInstanceId: ProviderInstanceId,
    nativeSessionId: string,
    signal?: AbortSignal,
  ): Promise<ThreadId | null> {
    return findThreadByNativeSession(
      this.http,
      this.rpc,
      providerInstanceId,
      nativeSessionId,
      signal,
    );
  }

  /** The full thread over HTTP. Raises `T3NotFoundError` when the thread does not exist. */
  detail(threadId: ThreadId, signal?: AbortSignal): Promise<OrchestrationV2ThreadDetailSnapshot> {
    return loadThreadDetail(this.http, threadId, signal);
  }

  /** The thread's projection over RPC, with a bounded timeline window. */
  projection(threadId: ThreadId, signal?: AbortSignal): Promise<OrchestrationV2ThreadProjection> {
    return this.rpc.call("orchestration.getThreadProjection", { threadId }, signal);
  }

  /**
   * An older timeline page for a bounded snapshot's `historyCursor`.
   * `throughEntryId` extends the page until it reaches that entry; the
   * `conversation` view keeps only conversation rows.
   */
  historyPage(
    threadId: ThreadId,
    cursor: string,
    options: ThreadHistoryPageOptions = {},
    signal?: AbortSignal,
  ): Promise<OrchestrationV2ThreadHistoryPage> {
    return loadThreadHistoryPage(this.http, threadId, cursor, options, signal);
  }

  /**
   * The thread's visible timeline in one HTTP read. Raises `T3NotFoundError`
   * when the thread does not exist, and `T3HttpError` with reason
   * `thread_transcript_too_large` when it exceeds the server's file attachment limit.
   */
  transcript(threadId: ThreadId, signal?: AbortSignal): Promise<OrchestrationV2ThreadTranscript> {
    return loadThreadTranscript(this.http, threadId, signal);
  }

  /** Create a thread with a generated id unless the caller supplies one. */
  async create(
    input: ThreadCreateInput,
    signal?: AbortSignal,
  ): Promise<OrchestrationV2ThreadShell> {
    const threadId = input.threadId ?? this.dispatcher.newThreadId();
    await this.dispatch(threadCreateCommand(this.dispatcher, threadId, input), signal);
    const created = await this.get(threadId, signal);
    if (!created) {
      throw new T3PreconditionError(`Thread ${threadId} was created but is not in the shell.`);
    }
    return created;
  }

  /** Returns the existing thread for `threadId` untouched, or creates it. */
  async ensure(
    input: ThreadCreateInput & { readonly threadId: ThreadId },
    signal?: AbortSignal,
  ): Promise<OrchestrationV2ThreadShell> {
    return (await this.get(input.threadId, signal)) ?? this.create(input, signal);
  }

  /** Creates the thread, prepares its workspace, and starts the first run when a message is given. */
  launch(
    input: ThreadLaunchInput,
    signal?: AbortSignal,
  ): Promise<OrchestrationV2ThreadLaunchResult> {
    return this.rpc.call(
      "orchestration.launchThread",
      threadLaunchPayload(this.dispatcher, input),
      signal,
    );
  }

  /** Update thread metadata. */
  async update(threadId: ThreadId, patch: ThreadMetaUpdate, signal?: AbortSignal): Promise<void> {
    await this.dispatch(
      {
        ...patch,
        type: "thread.metadata.update",
        commandId: this.dispatcher.newCommandId(),
        threadId,
      },
      signal,
    );
  }

  /** Resolves when the thread is archived, including when it is missing or already archived. */
  async archive(threadId: ThreadId, signal?: AbortSignal): Promise<void> {
    await this.#tolerant(
      this.#commands.simple("thread.archive", threadId),
      signal,
      /\balready archived\b/,
    );
  }

  /** Restore an archived thread. */
  async unarchive(threadId: ThreadId, signal?: AbortSignal): Promise<void> {
    await this.dispatch(this.#commands.simple("thread.unarchive", threadId), signal);
  }

  /** Mark a thread settled. */
  async settle(threadId: ThreadId, signal?: AbortSignal): Promise<void> {
    await this.dispatch(this.#commands.settle(threadId), signal);
  }

  /** Mark a thread unsettled. */
  async unsettle(threadId: ThreadId, signal?: AbortSignal): Promise<void> {
    await this.dispatch(this.#commands.unsettle(threadId), signal);
  }

  /** Resolves when the thread is gone, including when it never existed. */
  async delete(threadId: ThreadId, signal?: AbortSignal): Promise<void> {
    await this.#tolerant(this.#commands.simple("thread.delete", threadId), signal);
  }

  /** Set the thread runtime mode. */
  async setRuntimeMode(
    threadId: ThreadId,
    runtimeMode: RuntimeMode,
    signal?: AbortSignal,
  ): Promise<void> {
    await this.dispatch(this.#commands.setRuntimeMode(threadId, runtimeMode), signal);
  }

  /** Set the thread interaction mode. */
  async setInteractionMode(
    threadId: ThreadId,
    interactionMode: ProviderInteractionMode,
    signal?: AbortSignal,
  ): Promise<void> {
    await this.dispatch(this.#commands.setInteractionMode(threadId, interactionMode), signal);
  }

  /** Set the provider instance and model for a thread. */
  async setModelSelection(
    threadId: ThreadId,
    modelSelection: ModelSelection,
    signal?: AbortSignal,
  ): Promise<void> {
    await this.dispatch(this.#commands.setModelSelection(threadId, modelSelection), signal);
  }

  /** Dispatches `message.dispatch` and returns a handle that follows the run it starts or joins. */
  startTurn(input: StartTurnInput): Promise<TurnHandle> {
    return startThreadTurn(
      {
        dispatch: (command, s) => this.dispatch(command, s),
        watch: (threadId, options) => this.watch(threadId, options),
        interrupt: (threadId, runId, s) => this.interrupt(threadId, runId, {}, s),
        newCommandId: () => this.dispatcher.newCommandId(),
        newMessageId: () => this.dispatcher.newMessageId(),
      },
      input,
    );
  }

  /** Interrupts `runId`, or the thread's active run when omitted; nothing active is a no-op. */
  async interrupt(
    threadId: ThreadId,
    runId?: RunId,
    options: InterruptOptions = {},
    signal?: AbortSignal,
  ): Promise<void> {
    const target = runId ?? activeRun(await this.projection(threadId, signal))?.id;
    if (target === undefined) return;
    await this.dispatch(this.#commands.interrupt(threadId, target, options), signal);
  }

  /** The Stop button: interrupts the active run and holds the queue. Nothing active is a no-op. */
  stop(threadId: ThreadId, signal?: AbortSignal): Promise<void> {
    return this.interrupt(threadId, undefined, { holdQueue: true }, signal);
  }

  /** Answer a pending approval request. */
  async respondToApproval(input: ApprovalResponseInput, signal?: AbortSignal): Promise<void> {
    await this.dispatch(this.#commands.respondToApproval(input), signal);
  }

  /** Answer a pending user-input request. */
  async respondToUserInput(input: UserInputResponseInput, signal?: AbortSignal): Promise<void> {
    await this.dispatch(this.#commands.respondToUserInput(input), signal);
  }

  /** Dismiss a pending user-input request. */
  async dismissUserInput(input: UserInputDismissInput, signal?: AbortSignal): Promise<void> {
    await this.dispatch(this.#commands.dismissUserInput(input), signal);
  }

  /** Open approval and user-input requests, derived from the thread's projection. */
  async pendingRequests(threadId: ThreadId, signal?: AbortSignal): Promise<PendingRequest[]> {
    return pendingRequests(await this.projection(threadId, signal));
  }

  /** Resumable live view; the projection is seeded from the HTTP detail when resuming. */
  watch(threadId: ThreadId, options: WatchOptions = {}): AsyncIterable<ThreadWatchItem> {
    return watchThread(this.rpc, threadId, {
      ...options,
      snapshotLoader: (signal) => this.detail(threadId, signal),
    });
  }

  /** Follow one command row's output; decode failures remain stream items. */
  watchCommandOutput(
    input: OrchestrationV2SubscribeCommandOutputInput,
    options: WatchCommandOutputOptions = {},
  ): AsyncIterable<DecodedStreamItem<OrchestrationV2CommandOutputFrame>> {
    return watchCommandOutput(this.rpc, input, options);
  }

  /** Derive the visible phase from a thread summary. */
  phase(thread: OrchestrationV2ThreadShell): ThreadPhase {
    return threadPhase(thread);
  }

  /** Any orchestration command, validated locally and sent over the socket. */
  dispatch(command: OrchestrationV2Command, signal?: AbortSignal): Promise<DispatchResult> {
    return this.dispatcher.dispatch(command, signal);
  }

  async #tolerant(
    command: OrchestrationV2Command,
    signal: AbortSignal | undefined,
    pattern?: RegExp,
  ): Promise<void> {
    try {
      await this.dispatch(command, signal);
    } catch (error) {
      const tolerated =
        isMissingResourceError(error) ||
        (pattern !== undefined &&
          error instanceof T3RpcError &&
          error.is("OrchestrationV2DispatchCommandError") &&
          pattern.test(`${error.record.message} ${error.record.detail ?? ""}`));
      if (!tolerated) throw error;
    }
  }
}
