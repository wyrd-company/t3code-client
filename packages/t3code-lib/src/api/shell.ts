// ---
// relationships:
//   implements: library
// ---
/**
 * ShellApi: the lightweight cross-thread view (projects and thread shells,
 * active and archived) as a snapshot over HTTP or a resumable live stream
 * over RPC.
 */
import { T3InterruptedError, type T3DecodeError } from "../errors.ts";
import type { RpcClient } from "../rpc/client.ts";
import type { RpcMethods } from "../rpc/registry.ts";
import type { ThreadId } from "../schemas/common.ts";
import {
  ORCHESTRATION_PROTOCOL_HEADER,
  ORCHESTRATION_PROTOCOL_VERSION_TEXT,
} from "../schemas/environment.ts";
import {
  OrchestrationV2ShellSnapshot,
  type OrchestrationV2ArchivedShellSnapshot,
  type OrchestrationV2ShellStreamItem,
} from "../schemas/orchestration/shell.ts";
import type {
  OrchestrationV2GetOlderSettledThreadsInput,
  OrchestrationV2OlderSettledThreadsPage,
  OrchestrationV2ThreadFamily,
} from "../schemas/orchestration/shellOmittedRows.ts";
import type { HttpTransport } from "../transport/http.ts";
import { isKnownVariant } from "./threadProjection.ts";
import { shouldResubscribe } from "./watchRetry.ts";

export type ShellWatchItem =
  | Exclude<OrchestrationV2ShellStreamItem, { unknown: true }>
  | { readonly kind: "decode-error"; readonly error: T3DecodeError }
  | { readonly kind: "reconnected"; readonly afterSequence: number };

/**
 * Rows a snapshot leaves out. Send `omitIdleSubagents` only to servers that advertise
 * `shellThreadFamilies`, and `omitOlderSettled` only to servers that advertise `shellOlderSettled`.
 */
export interface ShellOmitOptions {
  /** Read these rows with `threadFamily` and `worktreeThreadIds`. */
  readonly omitIdleSubagents?: boolean;
  /** Counts these rows in `snapshot.olderSettled`; read them with `olderSettledThreads`. */
  readonly omitOlderSettled?: boolean;
}

export interface ShellWatchOptions extends ShellOmitOptions {
  readonly afterSequence?: number;
  readonly signal?: AbortSignal;
}

/** Orchestration HTTP routes answer only a client that names the protocol it speaks. */
export const orchestrationHttpHeaders = {
  [ORCHESTRATION_PROTOCOL_HEADER]: ORCHESTRATION_PROTOCOL_VERSION_TEXT,
} as const;

export function loadShellSnapshot(
  http: HttpTransport,
  signal?: AbortSignal,
  options: ShellOmitOptions = {},
): Promise<OrchestrationV2ShellSnapshot> {
  return http.request({
    method: "GET",
    path: "/api/orchestration/shell",
    auth: "required",
    headers: orchestrationHttpHeaders,
    query: {
      omitIdleSubagents: options.omitIdleSubagents === true ? "1" : undefined,
      omitOlderSettled: options.omitOlderSettled === true ? "1" : undefined,
    },
    decode: OrchestrationV2ShellSnapshot,
    ...(signal === undefined ? {} : { signal }),
  });
}

/**
 * Live and archived cross-thread snapshots. Thread shells carry optional
 * `latestRunStopRequested`: whether the latest run has an interruption request.
 * Optional `blockedOnThreadWait` reports whether the active run is blocked on
 * thread-wait work. Older servers can omit these fields. Reading them does not
 * request a stop or change wait behavior. Optional `lastErrorCode` is the current
 * provider failure code, or null when none applies; older servers can omit it.
 * A pending runtime request summary carries optional boolean `blocking`: false
 * for an async question the run can keep working past. Older servers can omit
 * it. Reading this metadata does not answer a request or change run behavior.
 * Linked pull request snapshot authors carry optional boolean `isBot` through
 * shell snapshots and updates. True, false, omission and unknown actor metadata
 * survive; malformed values fail decoding. This metadata does not grant permissions.
 */
export class ShellApi {
  readonly http: HttpTransport;
  readonly rpc: RpcClient<RpcMethods>;

  constructor(http: HttpTransport, rpc: RpcClient<RpcMethods>) {
    this.http = http;
    this.rpc = rpc;
  }

  /** Projects plus active and archived thread shells, over HTTP. */
  snapshot(
    signal?: AbortSignal,
    options?: ShellOmitOptions,
  ): Promise<OrchestrationV2ShellSnapshot> {
    return loadShellSnapshot(this.http, signal, options);
  }

  /** Archived thread shells and projects, over RPC. The server has no live archived stream. */
  archivedSnapshot(signal?: AbortSignal): Promise<OrchestrationV2ArchivedShellSnapshot> {
    return this.rpc.call("orchestration.getArchivedShellSnapshot", {}, signal);
  }

  /**
   * The active threads that share this thread's root, in any run state: the root, its forks and
   * their subagent trees. An unknown thread has an empty family.
   */
  threadFamily(threadId: ThreadId, signal?: AbortSignal): Promise<OrchestrationV2ThreadFamily> {
    return this.rpc.call("orchestration.getThreadFamily", { threadId }, signal);
  }

  /** Active threads on a worktree path, including subagent children a snapshot can leave out. */
  async worktreeThreadIds(worktreePath: string, signal?: AbortSignal): Promise<ThreadId[]> {
    const { threadIds } = await this.rpc.call(
      "orchestration.getWorktreeThreadIds",
      { worktreePath },
      signal,
    );
    return threadIds;
  }

  /** A page of older settled threads below the cursor; `limit: 0` fills only `counts`. */
  olderSettledThreads(
    input: OrchestrationV2GetOlderSettledThreadsInput,
    signal?: AbortSignal,
  ): Promise<OrchestrationV2OlderSettledThreadsPage> {
    return this.rpc.call("orchestration.getOlderSettledThreads", input, signal);
  }

  /** Subscribes with `orchestration.subscribeShell`; resubscribes after a dropped socket. */
  watch(options: ShellWatchOptions = {}): AsyncIterable<ShellWatchItem> {
    const rpc = this.rpc;
    return {
      async *[Symbol.asyncIterator]() {
        const { signal } = options;
        let afterSequence = options.afterSequence;
        let resumed = false;
        for (;;) {
          if (signal?.aborted) return;
          let received = false;
          try {
            const payload = {
              requestCompletionMarker: true,
              ...(afterSequence === undefined ? {} : { afterSequence }),
              ...(options.omitIdleSubagents === undefined
                ? {}
                : { omitIdleSubagents: options.omitIdleSubagents }),
              ...(options.omitOlderSettled === undefined
                ? {}
                : { omitOlderSettled: options.omitOlderSettled }),
            };
            const stream = rpc.stream(
              "orchestration.subscribeShell",
              payload,
              signal === undefined ? {} : { signal },
            );
            for await (const item of stream) {
              if (!received && resumed) {
                yield { kind: "reconnected", afterSequence: afterSequence ?? 0 };
              }
              received = true;
              if (item.kind === "decode-error") {
                yield item;
                continue;
              }
              const value = item.value;
              if (!isKnownVariant(value)) continue;
              if (value.kind === "snapshot") {
                afterSequence = Math.max(afterSequence ?? 0, value.snapshot.snapshotSequence);
              } else if (value.kind !== "synchronized") {
                if (afterSequence !== undefined && value.sequence <= afterSequence) continue;
                afterSequence = value.sequence;
              }
              yield value;
            }
            return;
          } catch (error) {
            if (signal?.aborted || error instanceof T3InterruptedError) return;
            if (shouldResubscribe(error, rpc.connection.state, received)) {
              resumed = true;
              continue;
            }
            throw error;
          }
        }
      },
    };
  }
}
