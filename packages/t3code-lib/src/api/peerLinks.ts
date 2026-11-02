// ---
// relationships:
//   implements: library
// ---
import type { RpcClient } from "../rpc/client.ts";
import type { RpcMethods } from "../rpc/registry.ts";
import type { RpcPayload, RpcSuccess } from "../rpc/spec.ts";
import type { EnvironmentId } from "../schemas/common.ts";
import type { PeerLinkSummary } from "../schemas/peerLink.ts";

/**
 * Links from this environment to other T3 Code environments (peers), so that
 * its agents can work there. `capabilities.peerLinks` advertises them. A
 * refusal rejects with a `T3RpcError` whose `PeerLinkError` record has a
 * `reason` such as `disabled`, `pairing_rejected`, `self` or `unreachable`.
 * The server setting `linkedEnvironmentsEnabled` is off by default and is needed
 * on both sides: off here, a new link rejects with `disabled`; off on the peer,
 * with `pairing_rejected`.
 */
export class PeerLinksApi {
  readonly rpc: RpcClient<RpcMethods>;

  constructor(rpc: RpcClient<RpcMethods>) {
    this.rpc = rpc;
  }

  /** List the links with their current status. The server checks each peer. Needs `access:read`. */
  async list(signal?: AbortSignal): Promise<readonly PeerLinkSummary[]> {
    const { links } = await this.rpc.call("peerLinks.list", {}, signal);
    return links;
  }

  /**
   * Link a peer with a pairing code from that peer. The code must carry the
   * scopes of `access`. Linking a peer again replaces its link. Needs `access:write`.
   */
  link(
    input: RpcPayload<RpcMethods, "peerLinks.link">,
    signal?: AbortSignal,
  ): Promise<RpcSuccess<RpcMethods, "peerLinks.link">> {
    return this.rpc.call("peerLinks.link", input, signal);
  }

  /** Remove a link; return whether one was removed. Needs `access:write`. */
  async unlink(environmentId: EnvironmentId, signal?: AbortSignal): Promise<boolean> {
    const { removed } = await this.rpc.call("peerLinks.unlink", { environmentId }, signal);
    return removed;
  }

  /**
   * Answer an agent's `link_request` turn item: `link`, `use-existing` or
   * `decline`. A link that the peer refuses resolves, and the turn item records
   * it as `failed`. A request that is gone or already answered rejects with a
   * `PeerLinkRequestError` record. Its reason `record_failed` can come after the
   * link was made, so check `list` after it. Needs `access:write`.
   */
  answerRequest(
    input: RpcPayload<RpcMethods, "peerLinks.answerRequest">,
    signal?: AbortSignal,
  ): Promise<void> {
    return this.rpc.call("peerLinks.answerRequest", input, signal);
  }
}
