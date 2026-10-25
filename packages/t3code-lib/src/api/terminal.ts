// ---
// relationships:
//   implements: library
// ---
import type { RpcClient } from "../rpc/client.ts";
import type { RpcMethods } from "../rpc/registry.ts";
import type { RpcPayload, RpcSuccess } from "../rpc/spec.ts";
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

  /** Subscribe to terminal lifecycle events. */
  watchEvents(options?: {
    readonly signal?: AbortSignal;
  }): AsyncIterable<DecodedStreamItem<RpcSuccess<RpcMethods, "subscribeTerminalEvents">>> {
    return unwrapStreamItems(this.rpc.stream("subscribeTerminalEvents", {}, options));
  }
}
