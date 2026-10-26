// ---
// relationships:
//   implements: library
// ---
/** `threads.watchCommandOutput`: one command row's output over `orchestration.subscribeCommandOutput`. */
import type { RpcClient } from "../rpc/client.ts";
import type { RpcMethods } from "../rpc/registry.ts";
import type {
  OrchestrationV2CommandOutputFrame,
  OrchestrationV2SubscribeCommandOutputInput,
} from "../schemas/orchestration/commandOutput.ts";
import { unwrapStreamItems, type DecodedStreamItem } from "./streamItems.ts";

export interface WatchCommandOutputOptions {
  readonly signal?: AbortSignal;
}

export function watchCommandOutput(
  rpc: RpcClient<RpcMethods>,
  input: OrchestrationV2SubscribeCommandOutputInput,
  options: WatchCommandOutputOptions = {},
): AsyncIterable<DecodedStreamItem<OrchestrationV2CommandOutputFrame>> {
  return unwrapStreamItems(
    rpc.stream(
      "orchestration.subscribeCommandOutput",
      input,
      options.signal === undefined ? undefined : { signal: options.signal },
    ),
  );
}
