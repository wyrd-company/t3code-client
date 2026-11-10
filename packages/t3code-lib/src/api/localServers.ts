// ---
// relationships:
//   implements: library
// ---
import type { RpcClient } from "../rpc/client.ts";
import type { RpcMethods } from "../rpc/registry.ts";
import type {
  DiscoveredLocalServerList,
  PreviewStopLocalServerInput,
  SubscribeDiscoveredLocalServersInput,
} from "../schemas/preview.ts";
import { firstItem, unwrapStreamItems, type DecodedStreamItem } from "./streamItems.ts";

/**
 * The local servers that the server's preview discovery finds on its host: listeners
 * that it attributes to a thread terminal (`terminal`) or to the agent of a thread
 * (`agent`), of every thread, plus each configured URL that answers as a web server,
 * which can have no owner. Process names are text that other programs chose.
 */
export class LocalServersApi {
  readonly rpc: RpcClient<RpcMethods>;

  constructor(rpc: RpcClient<RpcMethods>) {
    this.rpc = rpc;
  }

  /**
   * Follow the listeners (orchestration:read): a fresh scan, then each change. The
   * server also probes `configuredUrls`.
   */
  watch(
    input: SubscribeDiscoveredLocalServersInput = {},
    options?: { readonly signal?: AbortSignal },
  ): AsyncIterable<DecodedStreamItem<DiscoveredLocalServerList>> {
    return unwrapStreamItems(this.rpc.stream("subscribeDiscoveredLocalServers", input, options));
  }

  /** The listeners of one fresh scan (orchestration:read), from the first watch item. */
  list(
    input: SubscribeDiscoveredLocalServersInput = {},
    signal?: AbortSignal,
  ): Promise<DiscoveredLocalServerList> {
    return firstItem(
      this.watch(input, signal === undefined ? {} : { signal }),
      "discovered local server",
    );
  }

  /**
   * Stop a listener's process group (terminal:operate): SIGTERM, then SIGKILL after a
   * grace period. The server scans again and signals only a listener with this pid and
   * port that it attributes to a terminal or an agent; otherwise it fails with
   * `PreviewStopLocalServerError` reason `not-found`. A process group shared with the
   * server fails with reason `shared-group`.
   */
  async stop(input: PreviewStopLocalServerInput, signal?: AbortSignal): Promise<void> {
    await this.rpc.call("preview.stopLocalServer", input, signal);
  }
}
