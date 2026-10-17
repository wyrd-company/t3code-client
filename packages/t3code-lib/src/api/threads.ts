/**
 * ThreadsApi: thread lifecycle commands with server bookkeeping filled in,
 * idempotent `ensure` keyed by the caller's thread id, launches, request
 * responses, turns, and the resumable live watch. Reads live in
 * `threadReads.ts`.
 */
import { T3PreconditionError, T3RpcError } from "../errors.ts";
import type { RpcClient } from "../rpc/client.ts";
import type { RpcMethods } from "../rpc/registry.ts";
import type { RunId, ThreadId } from "../schemas/common.ts";
import type { OrchestrationV2Command } from "../schemas/orchestration/commands.ts";
import type { ThreadMetadataUpdatePayload } from "../schemas/orchestration/commands/thread.ts";
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
import { startThreadTurn } from "./threadTurnStart.ts";
import { watchThread, type ThreadWatchItem, type ThreadWatchOptions } from "./threadWatch.ts";
import type { StartTurnInput, TurnHandle } from "./turns.ts";

export type { ThreadCreateInput, ThreadLaunchInput } from "./threadCreation.ts";
export type { ThreadHistoryPageOptions, ThreadListOptions } from "./threadReads.ts";

export type ThreadMetaUpdate = ThreadMetadataUpdatePayload;

export type WatchOptions = Omit<ThreadWatchOptions, "snapshotLoader">;

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

  async unarchive(threadId: ThreadId, signal?: AbortSignal): Promise<void> {
    await this.dispatch(this.#commands.simple("thread.unarchive", threadId), signal);
  }

  async settle(threadId: ThreadId, signal?: AbortSignal): Promise<void> {
    await this.dispatch(this.#commands.settle(threadId), signal);
  }

  async unsettle(threadId: ThreadId, signal?: AbortSignal): Promise<void> {
    await this.dispatch(this.#commands.unsettle(threadId), signal);
  }

  /** Resolves when the thread is gone, including when it never existed. */
  async delete(threadId: ThreadId, signal?: AbortSignal): Promise<void> {
    await this.#tolerant(this.#commands.simple("thread.delete", threadId), signal);
  }

  async setRuntimeMode(
    threadId: ThreadId,
    runtimeMode: RuntimeMode,
    signal?: AbortSignal,
  ): Promise<void> {
    await this.dispatch(this.#commands.setRuntimeMode(threadId, runtimeMode), signal);
  }

  async setInteractionMode(
    threadId: ThreadId,
    interactionMode: ProviderInteractionMode,
    signal?: AbortSignal,
  ): Promise<void> {
    await this.dispatch(this.#commands.setInteractionMode(threadId, interactionMode), signal);
  }

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

  async respondToApproval(input: ApprovalResponseInput, signal?: AbortSignal): Promise<void> {
    await this.dispatch(this.#commands.respondToApproval(input), signal);
  }

  async respondToUserInput(input: UserInputResponseInput, signal?: AbortSignal): Promise<void> {
    await this.dispatch(this.#commands.respondToUserInput(input), signal);
  }

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
