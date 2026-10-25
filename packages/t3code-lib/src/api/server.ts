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
