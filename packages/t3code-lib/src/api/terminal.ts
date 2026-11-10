// ---
// relationships:
//   implements: library
// ---
import { T3ConnectionError } from "../errors.ts";
import type { RpcClient } from "../rpc/client.ts";
import type { RpcMethods } from "../rpc/registry.ts";
import type { RpcPayload, RpcSuccess } from "../rpc/spec.ts";
import { isUnknownVariant } from "../schemas/common.ts";
import type { TerminalSessionSnapshot, TerminalSummary } from "../schemas/terminal.ts";
import { unwrapStreamItems, type DecodedStreamItem } from "./streamItems.ts";

/**
 * Server terminal operations and event streams.
 * `attach` accepts optional boolean `resume`. With `resume: true`, resubscriptions
 * preserve closed, exited and evicted terminals instead of restarting them,
 * even when `restartIfNotRunning: true`. Unknown terminal IDs can recover when
 * `cwd` is supplied, including after a server restart. Omission and `false`
 * retain ordinary attach behavior; unknown IDs without `cwd` fail lookup.
 */
export class TerminalApi {
  readonly rpc: RpcClient<RpcMethods>;

  constructor(rpc: RpcClient<RpcMethods>) {
    this.rpc = rpc;
  }

  /** Open a server terminal. */
  open(
    input: RpcPayload<RpcMethods, "terminal.open">,
    signal?: AbortSignal,
  ): Promise<RpcSuccess<RpcMethods, "terminal.open">> {
    return this.rpc.call("terminal.open", input, signal);
  }

  /** Attach to a terminal output stream. */
  attach(
    input: RpcPayload<RpcMethods, "terminal.attach">,
    options?: { readonly signal?: AbortSignal },
  ): AsyncIterable<DecodedStreamItem<RpcSuccess<RpcMethods, "terminal.attach">>> {
    return unwrapStreamItems(this.rpc.stream("terminal.attach", input, options));
  }

  /** Write input to a server terminal. */
  write(
    input: RpcPayload<RpcMethods, "terminal.write">,
    signal?: AbortSignal,
  ): Promise<RpcSuccess<RpcMethods, "terminal.write">> {
    return this.rpc.call("terminal.write", input, signal);
  }

  /** Resize a server terminal. */
  resize(
    input: RpcPayload<RpcMethods, "terminal.resize">,
    signal?: AbortSignal,
  ): Promise<RpcSuccess<RpcMethods, "terminal.resize">> {
    return this.rpc.call("terminal.resize", input, signal);
  }

  /** Close a server terminal. */
  close(
    input: RpcPayload<RpcMethods, "terminal.close">,
    signal?: AbortSignal,
  ): Promise<RpcSuccess<RpcMethods, "terminal.close">> {
    return this.rpc.call("terminal.close", input, signal);
  }

  /**
   * Follow one terminal without starting it: a `snapshot` with its retained history,
   * then output and state events. Needs only `terminal:read`. An unknown terminal fails
   * with `TerminalSessionLookupError`.
   */
  observe(
    input: RpcPayload<RpcMethods, "terminal.observe">,
    options?: { readonly signal?: AbortSignal },
  ): AsyncIterable<DecodedStreamItem<RpcSuccess<RpcMethods, "terminal.observe">>> {
    return unwrapStreamItems(this.rpc.stream("terminal.observe", input, options));
  }

  /** Follow every terminal: a `snapshot` of all of them, then `upsert` and `remove` events. */
  watchMetadata(options?: {
    readonly signal?: AbortSignal;
  }): AsyncIterable<DecodedStreamItem<RpcSuccess<RpcMethods, "subscribeTerminalMetadata">>> {
    return unwrapStreamItems(this.rpc.stream("subscribeTerminalMetadata", {}, options));
  }

  /** Every terminal the server keeps, from the first metadata snapshot. */
  async list(signal?: AbortSignal): Promise<TerminalSummary[]> {
    const first = await firstItem(this.watchMetadata(signal === undefined ? {} : { signal }));
    if (isUnknownVariant<"type">(first) || first.type !== "snapshot")
      throw new T3ConnectionError("protocol", "The terminal list did not start with a snapshot.");
    return first.terminals;
  }

  /**
   * One terminal's current snapshot, with the history the server retains. Does not
   * start or attach to the terminal. An unknown terminal fails with
   * `TerminalSessionLookupError`.
   */
  async read(
    input: RpcPayload<RpcMethods, "terminal.observe">,
    signal?: AbortSignal,
  ): Promise<TerminalSessionSnapshot> {
    const first = await firstItem(this.observe(input, signal === undefined ? {} : { signal }));
    if (isUnknownVariant<"type">(first) || first.type !== "snapshot")
      throw new T3ConnectionError("protocol", "The terminal stream did not start with a snapshot.");
    return first.snapshot;
  }
}

/** The first decoded item; the stream is closed after it. */
async function firstItem<T>(source: AsyncIterable<DecodedStreamItem<T>>): Promise<T> {
  for await (const item of source) {
    if (typeof item === "object" && item !== null && "kind" in item && item.kind === "decode-error")
      throw item.error;
    return item as T;
  }
  throw new T3ConnectionError("protocol", "The terminal stream ended before its first item.");
}
