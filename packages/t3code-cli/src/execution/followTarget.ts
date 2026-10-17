// ---
// relationships:
//   implements: output-contract
// ---
import type { TurnHandle } from "@wyrd-company/t3code-lib";

/** The run a waiting command follows after dispatch, or at `thread wait`. */
export interface FollowTarget {
  readonly threadId: string;
  /** Known run id. Omitted for `thread wait`: active run at invocation, else latest run. */
  readonly runId?: string;
  /** Library turn handle when this invocation dispatched the prompt. */
  readonly turn?: TurnHandle;
}

/** Timeout, request and approval policy shared by run, waiting start, send and wait. */
export interface FollowPolicy {
  /** Run deadline. Absent means no deadline. */
  readonly timeoutMs?: number;
  readonly onTimeout: "detach" | "interrupt";
  /** `fail` is the default fail-fast policy; `wait` keeps waiting until the deadline. */
  readonly onRequest: "fail" | "wait";
  /** Applies to approval requests only. */
  readonly approve?: "accept" | "reject";
}
