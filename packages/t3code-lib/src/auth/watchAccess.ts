// ---
// relationships:
//   implements: library
// ---
import { unwrapStreamItems, type DecodedStreamItem } from "../api/streamItems.ts";
import type { RpcClient } from "../rpc/client.ts";
import type { AuthAccessStreamEvent } from "../rpc/methods/authAccess.ts";
import type { RpcMethods } from "../rpc/registry.ts";

/** Watch changes to access grants and authenticated clients. */
export function watchAccess(
  rpc: RpcClient<RpcMethods>,
  options?: { readonly signal?: AbortSignal },
): AsyncIterable<DecodedStreamItem<AuthAccessStreamEvent>> {
  return unwrapStreamItems(rpc.stream("subscribeAuthAccess", {}, options));
}
