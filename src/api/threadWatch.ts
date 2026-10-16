// ---
// relationships:
//   implements: design
// ---
/**
 * watchThread: a resumable live view of one thread. It subscribes with
 * `orchestration.subscribeThread`, keeps a projected thread (seeded from the
 * snapshot frame, or from `snapshotLoader` when the server replays events
 * instead of sending a snapshot), derives domain items from the projection,
 * and resubscribes with `afterSequence` when the socket drops.
 */
import { T3InterruptedError, type T3DecodeError } from "../errors.ts";
import type { RpcClient } from "../rpc/client.ts";
import type { RpcMethods } from "../rpc/registry.ts";
import type { ThreadId } from "../schemas/common.ts";
import type { OrchestrationV2DomainEvent } from "../schemas/orchestration/events.ts";
import { boundedSnapshotProjection } from "../schemas/orchestration/boundedSnapshot.ts";
import type { OrchestrationV2ThreadDetailSnapshot } from "../schemas/orchestration/projection.ts";
import { isKnownVariant } from "./threadProjection.ts";
import { ThreadProjectionTracker, type ThreadDerivedItem } from "./threadTracker.ts";
import { shouldResubscribe } from "./watchRetry.ts";

export type { ThreadDerivedItem } from "./threadTracker.ts";

export type ThreadWatchItem =
  | { readonly kind: "snapshot"; readonly snapshot: OrchestrationV2ThreadDetailSnapshot }
  | { readonly kind: "synchronized" }
  | {
      readonly kind: "event";
      readonly sequence: number;
      readonly event: OrchestrationV2DomainEvent;
    }
  | ThreadDerivedItem
  | { readonly kind: "decode-error"; readonly error: T3DecodeError }
  | { readonly kind: "reconnected"; readonly afterSequence: number };

export interface ThreadWatchOptions {
  /** Resume after this sequence instead of asking for a snapshot. */
  readonly afterSequence?: number;
  /** Accept a bounded snapshot: full control-plane state with a recent window of timeline rows. */
  readonly acceptBoundedSnapshot?: boolean;
  /** Let a bounded snapshot omit repeated turn items; the watch restores them before yielding. */
  readonly acceptCompactTurnItems?: boolean;
  readonly signal?: AbortSignal;
  /** Loads a detail snapshot when the server replays events without one (HTTP thread detail). */
  readonly snapshotLoader?: (signal?: AbortSignal) => Promise<OrchestrationV2ThreadDetailSnapshot>;
}

export type ThreadWatchRpc = Pick<RpcClient<RpcMethods>, "stream"> & {
  readonly connection: Pick<RpcClient<RpcMethods>["connection"], "state">;
};

export function watchThread(
  rpc: ThreadWatchRpc,
  threadId: ThreadId,
  options: ThreadWatchOptions = {},
): AsyncIterable<ThreadWatchItem> {
  return { [Symbol.asyncIterator]: () => run(rpc, threadId, options) };
}

async function* run(
  rpc: ThreadWatchRpc,
  threadId: ThreadId,
  options: ThreadWatchOptions,
): AsyncGenerator<ThreadWatchItem> {
  const { signal } = options;
  const tracker = new ThreadProjectionTracker();
  // The resume cursor: the last sequence the consumer has seen.
  let afterSequence = options.afterSequence;
  let resumed = false;
  for (;;) {
    if (signal?.aborted) return;
    let received = false;
    try {
      const payload = {
        threadId,
        requestCompletionMarker: true,
        ...(afterSequence === undefined ? {} : { afterSequence }),
        ...(options.acceptBoundedSnapshot === true ? { acceptBoundedSnapshot: true } : {}),
        ...(options.acceptCompactTurnItems === true ? { acceptCompactTurnItems: true } : {}),
      };
      const stream = rpc.stream(
        "orchestration.subscribeThread",
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
          const { kind: _kind, turnItemsOmitLocalVisible, ...rest } = value;
          const snapshot = {
            ...rest,
            projection: boundedSnapshotProjection({ ...rest, turnItemsOmitLocalVisible }),
          };
          afterSequence = Math.max(afterSequence ?? 0, snapshot.snapshotSequence);
          yield { kind: "snapshot", snapshot };
          yield* tracker.seed(snapshot);
          continue;
        }
        if (!tracker.seeded && options.snapshotLoader) {
          // Resuming: the server replays events after `afterSequence` without a
          // snapshot, so the projection is seeded from a detail snapshot. Replayed
          // events the snapshot already reflects are passed through but not
          // re-applied.
          const snapshot = await options.snapshotLoader(signal);
          yield { kind: "snapshot", snapshot };
          yield* tracker.seed(snapshot);
        }
        if (value.kind === "synchronized") {
          yield value;
          continue;
        }
        if (afterSequence !== undefined && value.sequence <= afterSequence) continue; // replay overlap
        afterSequence = value.sequence;
        yield { kind: "event", sequence: value.sequence, event: value.event };
        yield* tracker.apply(value.sequence, value.event);
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
}
