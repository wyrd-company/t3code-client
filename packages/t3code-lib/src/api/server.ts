// ---
// relationships:
//   implements: library
// ---
import type { RpcClient } from "../rpc/client.ts";
import type { RpcMethods } from "../rpc/registry.ts";
import type { RpcPayload, RpcSuccess } from "../rpc/spec.ts";
import {
  ExecutionEnvironmentDescriptor,
  type ExecutionEnvironmentDescriptor as ExecutionEnvironmentDescriptorType,
} from "../schemas/environment.ts";
import type { ServerProvider, ServerProviderModel } from "../schemas/provider.ts";
import type { HttpTransport } from "../transport/http.ts";
import { unwrapStreamItems, type DecodedStreamItem } from "./streamItems.ts";

export interface WatchServerConfigOptions {
  readonly environmentThemes?: boolean;
  readonly usageLimitSources?: boolean;
  readonly signal?: AbortSignal;
}

export interface WatchServerLifecycleOptions {
  readonly signal?: AbortSignal;
}

/**
 * Server environment, configuration and providers.
 * Environment capabilities include optional boolean `environmentThemes`: true
 * advertises environment-theme publication through configuration streams. False
 * and omission are preserved; omission does not advertise support. Available
 * through environment reads, configuration reads and configuration snapshots.
 * Supplied non-boolean values fail decoding.
 * Environment capabilities also include optional boolean `usageLimitSources`:
 * true advertises quota streaming from configured usage-limit sources. False
 * and omission are preserved; omission does not advertise support. Available
 * through environment reads, configuration reads and configuration snapshots.
 * Supplied non-boolean values fail decoding.
 * Environment capabilities also include optional boolean `usagePriceOverrides`:
 * true advertises custom model rate persistence and application to usage summaries.
 * False and omission are preserved; omission does not advertise support. Available
 * through environment reads, configuration reads and configuration snapshots.
 * Supplied non-boolean values fail decoding. This flag does not configure rates.
 * Environment capabilities also include optional boolean `usageModelAliases`:
 * true advertises model-name mapping through configured usage aliases. False
 * and omission are preserved; omission does not advertise support. Available
 * through environment reads, configuration reads and configuration snapshots.
 * Supplied non-boolean values fail decoding. This flag does not configure aliases.
 * Environment capabilities also include optional boolean `threadPinning`:
 * true advertises support for pinning threads. False and omission are preserved;
 * omission does not advertise support. Available through environment reads,
 * configuration reads and configuration snapshots. Supplied non-boolean values
 * fail decoding. This metadata flag does not pin a thread.
 * Environment capabilities also include optional boolean `threadPinReorder`:
 * true advertises support for reordering pinned threads. False and omission are
 * preserved; omission does not advertise support. Available through environment
 * reads, configuration reads and configuration snapshots. Supplied non-boolean
 * values fail decoding. This metadata flag does not reorder a thread.
 * Environment capabilities also include optional boolean `threadActiveReorder`:
 * true advertises persistence of manual Active thread order. False and omission
 * are preserved; omission does not advertise support. Available through
 * environment reads, configuration reads and configuration snapshots. Supplied
 * non-boolean values fail decoding. This metadata flag does not reorder a thread.
 * Environment capabilities also include optional boolean `threadAutoSettleOptOut`:
 * true advertises support for disabling auto-settle per thread. False and omission
 * are preserved; omission does not advertise support. Available through
 * environment reads, configuration reads and configuration snapshots. Supplied
 * non-boolean values fail decoding. This metadata flag does not change auto-settle.
 * Environment capabilities also include optional boolean `threadTitleRegeneration`:
 * true advertises support for regenerating thread titles through thread metadata
 * updates. False and omission are preserved; omission does not advertise support.
 * Available through environment reads, configuration reads and configuration
 * snapshots. Supplied non-boolean values fail decoding. This metadata flag does
 * not regenerate a title.
 * Environment capabilities also include optional boolean `threadPullRequestLinking`:
 * true advertises support for linking pull requests to threads. False and omission
 * are preserved; omission does not advertise support. Available through environment
 * reads, configuration reads and configuration snapshots. Supplied non-boolean
 * values fail decoding. This metadata flag does not link a pull request.
 * Environment capabilities also include optional boolean `threadPullRequests`:
 * true advertises support for thread pull requests. False and omission are
 * preserved; omission does not advertise support. Available through environment
 * reads, configuration reads and configuration snapshots. Supplied non-boolean
 * values fail decoding.
 * Environment capabilities also include optional boolean `pullRequestChecks`:
 * true advertises support for pull request checks. False and omission are
 * preserved; omission does not advertise support. Available through environment
 * reads, configuration reads and configuration snapshots. Supplied non-boolean
 * values fail decoding. This metadata flag does not fetch or run checks.
 * Environment capabilities also include optional boolean `threadSnooze`:
 * true advertises support for snoozing threads. False and omission are preserved;
 * omission does not advertise support. Available through environment reads,
 * configuration reads and configuration snapshots. Supplied non-boolean values
 * fail decoding. This metadata flag does not snooze a thread.
 * Environment capabilities also include optional boolean `threadRestartContinuation`:
 * true advertises persistence of the opt-in for continuing interrupted threads
 * after restarts. False and omission are preserved; omission does not advertise
 * support. Available through environment reads, configuration reads and
 * configuration snapshots. Supplied non-boolean values fail decoding.
 * This metadata flag does not configure or trigger continuation.
 * Environment capabilities also include optional boolean `projectSettingsOverrides`:
 * true advertises support for resolving project settings overrides. False and
 * omission are preserved; omission does not advertise support. Available through
 * environment reads, configuration reads and configuration snapshots. Supplied
 * non-boolean values fail decoding. This metadata flag does not change settings.
 * Environment capabilities also include optional boolean `projectProviderInstanceOverrides`:
 * true advertises support for resolving a project's provider instance overrides.
 * False and omission are preserved; omission does not advertise support. Available
 * through environment reads, configuration reads and configuration snapshots.
 * Supplied non-boolean values fail decoding. This metadata flag does not change
 * provider settings.
 * Environment capabilities also include optional boolean `projectCloneTracking`:
 * true advertises support for tracking project clones and streaming their progress.
 * False and omission are preserved; omission does not advertise support. Available
 * through environment reads, configuration reads and configuration snapshots.
 * Supplied non-boolean values fail decoding. This metadata flag does not start or
 * track a clone.
 * Environment capabilities also include optional boolean `environmentIcon`:
 * true advertises support for a custom environment icon. False and omission are
 * preserved; omission does not advertise support. Available through environment
 * reads, configuration reads and configuration snapshots. Supplied non-boolean
 * values fail decoding. This metadata flag does not select or change an icon.
 * Environment capabilities also include optional boolean `threadAutoSettlement`:
 * true advertises server evaluation of merge and inactivity settlement without a
 * client. False and omission are preserved; omission does not advertise support.
 * Available through environment reads, configuration reads and configuration
 * snapshots. Supplied non-boolean values fail decoding. This metadata flag does
 * not change settlement settings or settle a thread.
 * Environment capabilities also include optional boolean `requiredWorktreeBootstrap`:
 * true advertises support for required worktree bootstrap. False and omission are
 * preserved; omission does not advertise support. Available through environment
 * reads, configuration reads and configuration snapshots. Supplied non-boolean
 * values fail decoding. This metadata flag does not enforce bootstrap or change
 * policy.
 * Provider `installedVersion` is an optional nullable trimmed nonempty string:
 * the installed CLI version for a local provider with a separate server.
 * Null means unknown; omission leaves legacy snapshots on `version`.
 * This metadata is available through configuration reads, provider lists and
 * configuration streams; it does not enforce a provider version policy.
 * Provider workspace snapshots expose optional `optionDescriptors` arrays using
 * the existing boolean/select descriptor union. Omission means no descriptor
 * snapshot was supplied; an empty array supplies no options. Unknown descriptor
 * types decode to `{ unknown: true, raw }`; malformed known types fail decoding.
 * Workspace `slashCommandsPending` is an optional boolean: true marks pending
 * slash-command discovery; false and omission are preserved without inference.
 * A pending snapshot can retain the previous slash commands.
 */
export class ServerApi {
  readonly rpc: RpcClient<RpcMethods>;
  readonly http: HttpTransport;

  constructor(rpc: RpcClient<RpcMethods>, http: HttpTransport) {
    this.rpc = rpc;
    this.http = http;
  }

  /** Probe server health through RPC. */
  async probe(signal?: AbortSignal): Promise<void> {
    await this.rpc.call("server.probe", {}, signal);
  }

  /** Read server configuration, including provider instances and models. */
  getConfig(signal?: AbortSignal): Promise<RpcSuccess<RpcMethods, "server.getConfig">> {
    return this.rpc.call("server.getConfig", {}, signal);
  }

  /** Read server settings. */
  getSettings(signal?: AbortSignal): Promise<RpcSuccess<RpcMethods, "server.getSettings">> {
    return this.rpc.call("server.getSettings", {}, signal);
  }

  /** Refresh the selected provider instances. */
  refreshProviders(
    input: RpcPayload<RpcMethods, "server.refreshProviders"> = {},
    signal?: AbortSignal,
  ): Promise<RpcSuccess<RpcMethods, "server.refreshProviders">> {
    return this.rpc.call("server.refreshProviders", input, signal);
  }

  /** Subscribe to configuration changes; decode failures remain stream items. */
  watchConfig(
    options: WatchServerConfigOptions = {},
  ): AsyncIterable<DecodedStreamItem<RpcSuccess<RpcMethods, "subscribeServerConfig">>> {
    const { signal, environmentThemes, usageLimitSources } = options;
    return unwrapStreamItems(
      this.rpc.stream(
        "subscribeServerConfig",
        {
          ...(environmentThemes === undefined ? {} : { environmentThemes }),
          ...(usageLimitSources === undefined ? {} : { usageLimitSources }),
        },
        signal === undefined ? undefined : { signal },
      ),
    );
  }

  /** Subscribe to server lifecycle events. */
  watchLifecycle(
    options: WatchServerLifecycleOptions = {},
  ): AsyncIterable<DecodedStreamItem<RpcSuccess<RpcMethods, "subscribeServerLifecycle">>> {
    return unwrapStreamItems(
      this.rpc.stream(
        "subscribeServerLifecycle",
        {},
        options.signal === undefined ? undefined : { signal: options.signal },
      ),
    );
  }

  /** Read the public environment descriptor over HTTP. */
  environment(signal?: AbortSignal): Promise<ExecutionEnvironmentDescriptorType> {
    return this.http.request({
      method: "GET",
      path: "/.well-known/t3/environment",
      auth: "none",
      decode: ExecutionEnvironmentDescriptor,
      ...(signal === undefined ? {} : { signal }),
    });
  }

  /** List configured provider instances. */
  async providers(signal?: AbortSignal): Promise<ServerProvider[]> {
    return (await this.getConfig(signal)).providers;
  }

  /** Find a provider model by slug or alias; return undefined when absent. */
  async findModel(
    instanceId: string,
    model: string,
  ): Promise<
    { readonly provider: ServerProvider; readonly model: ServerProviderModel } | undefined
  > {
    const provider = (await this.getConfig()).providers.find(
      (candidate) => candidate.instanceId === instanceId,
    );
    if (!provider) return undefined;
    const found = provider.models.find(
      (candidate) => candidate.slug === model || candidate.aliases?.includes(model) === true,
    );
    return found === undefined ? undefined : { provider, model: found };
  }
}
