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

export class ServerApi {
  readonly rpc: RpcClient<RpcMethods>;
  readonly http: HttpTransport;

  constructor(rpc: RpcClient<RpcMethods>, http: HttpTransport) {
    this.rpc = rpc;
    this.http = http;
  }

  async probe(signal?: AbortSignal): Promise<void> {
    await this.rpc.call("server.probe", {}, signal);
  }

  getConfig(signal?: AbortSignal): Promise<RpcSuccess<RpcMethods, "server.getConfig">> {
    return this.rpc.call("server.getConfig", {}, signal);
  }

  getSettings(signal?: AbortSignal): Promise<RpcSuccess<RpcMethods, "server.getSettings">> {
    return this.rpc.call("server.getSettings", {}, signal);
  }

  refreshProviders(
    input: RpcPayload<RpcMethods, "server.refreshProviders"> = {},
    signal?: AbortSignal,
  ): Promise<RpcSuccess<RpcMethods, "server.refreshProviders">> {
    return this.rpc.call("server.refreshProviders", input, signal);
  }

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

  environment(signal?: AbortSignal): Promise<ExecutionEnvironmentDescriptorType> {
    return this.http.request({
      method: "GET",
      path: "/.well-known/t3/environment",
      auth: "none",
      decode: ExecutionEnvironmentDescriptor,
      ...(signal === undefined ? {} : { signal }),
    });
  }

  async providers(signal?: AbortSignal): Promise<ServerProvider[]> {
    return (await this.getConfig(signal)).providers;
  }

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
