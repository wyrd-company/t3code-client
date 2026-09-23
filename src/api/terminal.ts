import type { RpcClient } from "../rpc/client.ts";
import type { RpcMethods } from "../rpc/registry.ts";
import type { RpcPayload, RpcSuccess } from "../rpc/spec.ts";
import { unwrapStreamItems, type DecodedStreamItem } from "./streamItems.ts";

export class TerminalApi {
  readonly rpc: RpcClient<RpcMethods>;

  constructor(rpc: RpcClient<RpcMethods>) {
    this.rpc = rpc;
  }

  open(
    input: RpcPayload<RpcMethods, "terminal.open">,
    signal?: AbortSignal,
  ): Promise<RpcSuccess<RpcMethods, "terminal.open">> {
    return this.rpc.call("terminal.open", input, signal);
  }

  attach(
    input: RpcPayload<RpcMethods, "terminal.attach">,
    options?: { readonly signal?: AbortSignal },
  ): AsyncIterable<DecodedStreamItem<RpcSuccess<RpcMethods, "terminal.attach">>> {
    return unwrapStreamItems(this.rpc.stream("terminal.attach", input, options));
  }

  write(
    input: RpcPayload<RpcMethods, "terminal.write">,
    signal?: AbortSignal,
  ): Promise<RpcSuccess<RpcMethods, "terminal.write">> {
    return this.rpc.call("terminal.write", input, signal);
  }

  resize(
    input: RpcPayload<RpcMethods, "terminal.resize">,
    signal?: AbortSignal,
  ): Promise<RpcSuccess<RpcMethods, "terminal.resize">> {
    return this.rpc.call("terminal.resize", input, signal);
  }

  close(
    input: RpcPayload<RpcMethods, "terminal.close">,
    signal?: AbortSignal,
  ): Promise<RpcSuccess<RpcMethods, "terminal.close">> {
    return this.rpc.call("terminal.close", input, signal);
  }

  watchEvents(options?: {
    readonly signal?: AbortSignal;
  }): AsyncIterable<DecodedStreamItem<RpcSuccess<RpcMethods, "subscribeTerminalEvents">>> {
    return unwrapStreamItems(this.rpc.stream("subscribeTerminalEvents", {}, options));
  }
}
