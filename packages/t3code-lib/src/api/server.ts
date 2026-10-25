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
 * Configuration reads and snapshots expose optional `directEndpoints`: address
 * hints with `kind` (lan or tailnet) and nonempty `httpBaseUrl`. Empty arrays and
 * omission are distinct. Unknown kind strings and extra metadata are preserved;
 * malformed entries are dropped, while a non-array field fails decoding.
 * These are hints only: consumers must verify that an address answers as this
 * environment before using it. Reading them does not select or connect to one.
 * Configuration reads and configuration snapshots expose optional
 * `lastEventLoopStall`: the latest recent noticeable server event-loop stall.
 * It contains string `detectedAt`, nonnegative integer `durationMs`, positive
 * integer `cpuCount` and optional numeric `loadAverage` (absent on Windows).
 * Omission means no recent stall was supplied; null and malformed objects fail
 * decoding. Unknown metadata is preserved. The server controls detection and
 * expiry; reading this metadata does not cache it or change timing.
 * Environment capabilities include optional boolean `environmentThemes`: true
 * advertises environment-theme publication through configuration streams. False
 * and omission are preserved; omission does not advertise support. Available
 * through environment reads, configuration reads and configuration snapshots.
 * Supplied non-boolean values fail decoding.
 * Provider setup records expose optional `documentationUrl`: a trimmed nonempty
 * string of at most 2,048 characters. Setup and field omission stay absent.
 * Malformed provider records are omitted by existing forward-compatible arrays
 * in reads and streams; unknown setup metadata is preserved. Reading this
 * metadata does not fetch or open documentation.
 *
 * Provider records expose optional `iconUrl`: a trimmed nonempty string of at
 * most 2,048 characters. Omission stays absent. Malformed provider records are
 * omitted by the existing forward-compatible arrays in config reads and streams.
 * Unknown provider metadata is preserved. This field does not fetch or render
 * an icon; consumers that display remote icons must validate the driver origin.
 * Published environment themes expose optional `canvas`: a seed color written
 * as #RGB or #RRGGBB, with either letter case preserved. Omission stays absent;
 * whitespace, other strings, null and non-string values fail decoding. Available
 * in configuration theme arrays and environmentThemesUpdated stream payloads.
 * Published themes also expose optional `accent` with the same #RGB/#RRGGBB
 * format, exact color and case preservation, omission and malformed-value rules
 * through configuration arrays and environmentThemesUpdated payloads.
 * Published themes expose optional `version`: the literal number 1. Omission
 * stays absent in configuration theme arrays and environmentThemesUpdated
 * stream payloads. This is theme-file metadata, not a server version check.
 * Published themes expose optional `colors`: a palette map whose keys match
 * /^[a-zA-Z][a-zA-Z0-9]{0,63}$/ and whose string values are trimmed, nonempty
 * and at most 64 characters after trimming. Empty maps are valid; omission stays
 * absent. Malformed maps fail decoding in config reads and snapshots; theme
 * streams report decode errors and continue. Values are not restricted to hex.
 * Published themes expose optional `variants` with independently optional `light`
 * and `dark` palette maps. Palette keys match /^[a-zA-Z][a-zA-Z0-9]{0,63}$/;
 * values are trimmed nonempty strings of at most 64 characters, including CSS
 * color forms beyond hex. Empty variants and empty palettes are valid. Omission
 * stays absent; malformed known palettes fail config decoding and produce
 * recoverable stream decode-errors. Unknown theme and variant metadata is preserved.
 * Reading these palette variants does not apply a theme.
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
 * Environment capabilities also include optional boolean `commandOutputStreaming`:
 * true advertises support for streaming command output. False and omission are
 * preserved; omission does not advertise support. Available through environment
 * reads, configuration reads and configuration snapshots. Supplied non-boolean
 * values fail decoding. This metadata flag does not subscribe to command output.
 * Environment capabilities also include optional boolean `ignoredFileListing`:
 * true advertises support for listing ignored files. False and omission are
 * preserved; omission does not advertise support. Available through environment
 * reads, configuration reads and configuration snapshots. Supplied non-boolean
 * values fail decoding. This metadata flag does not list ignored files.
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
 * Environment capabilities also include optional boolean `databaseStorage`:
 * true advertises streaming database size and reclaimable space. False and omission
 * are preserved; omission does not advertise support. Available through environment
 * reads, configuration reads and configuration snapshots. Supplied non-boolean
 * values fail decoding. This metadata flag does not read database storage.
 * Environment capabilities include optional boolean `storageCleanup`: true
 * advertises storage cleanup support. False and omission are preserved; omission
 * does not advertise support. Available through environment reads, configuration
 * reads and configuration snapshots. Supplied non-boolean values fail decoding.
 * This metadata flag does not perform storage cleanup.
 * Environment capabilities include optional boolean `storageCleanupRun`: true
 * advertises support for running storage cleanup. False and omission are preserved;
 * omission does not advertise support. Available through environment reads,
 * configuration reads and configuration snapshots. Supplied non-boolean values
 * fail decoding. This metadata flag does not run storage cleanup.
 * Environment capabilities also include optional boolean `otlpEndpointCheck`:
 * true advertises support for checking OTLP endpoints for telemetry export settings.
 * False and omission are preserved; omission does not advertise support. Available
 * through environment reads, configuration reads and configuration snapshots.
 * Supplied non-boolean values fail decoding. This metadata flag does not check an endpoint.
 * Environment capabilities also include optional boolean `pullRequestStackActions`:
 * true advertises support for pull request stack actions. False and omission are
 * preserved; omission does not advertise support. Available through environment
 * reads, configuration reads and configuration snapshots. Supplied non-boolean
 * values fail decoding. This metadata flag does not perform a pull request stack action.
 * Environment capabilities also include optional boolean `pullRequests`: true
 * advertises server pull request support. False and omission are preserved; omission
 * does not advertise support. Available through environment reads, configuration
 * reads and configuration snapshots. Supplied non-boolean values fail decoding.
 * This metadata flag performs no pull request operation.
 * Environment capabilities also include optional boolean `threadStop`:
 * true advertises support for the upstream thread-stop command. False and
 * omission are preserved; omission does not advertise support. Supplied
 * non-boolean values fail decoding. Available through environment reads,
 * configuration reads and configuration snapshots; unknown fields remain intact.
 * This metadata flag does not dispatch a command or change `threads.stop`.
 * Environment capabilities also include optional boolean `serverUpdateThreadContinuation`:
 * true advertises continuation of running provider turns after a server update.
 * False and omission are preserved; omission does not advertise support.
 * Supplied non-boolean values fail decoding. Unknown fields remain intact.
 * This metadata flag does not start an update, restart the server or continue a turn.
 *
 * Environment capabilities also include optional `serverSelfUpdate`: `boot-service`,
 * `respawn` or `desktop-managed` identifies the advertised server update path.
 * Omission is preserved and advertises no update path. Unknown strings are preserved
 * for forward compatibility; supplied non-string values fail decoding. Available
 * through environment reads, configuration reads and configuration snapshots.
 * This metadata does not start an update or restart a server or desktop app.
 *
 * Environment capabilities also include optional boolean `serverSelfUpdateProgress`:
 * true advertises streaming self-update progress before restart acknowledgement.
 * False and omission are preserved; omission does not advertise streaming support.
 * Available through environment reads, configuration reads and configuration snapshots.
 * Supplied non-boolean values fail decoding. This metadata flag does not start
 * an update, subscribe to progress or restart the server.
 * Environment capabilities also include optional boolean `desktopAppUpdate`:
 * true advertises a desktop app update through the supervising desktop app.
 * False and omission are preserved; omission does not advertise support. Available
 * through environment reads, configuration reads and configuration snapshots.
 * Supplied non-boolean values fail decoding. This metadata flag does not update
 * or restart the desktop app or server.
 * Environment capabilities also include optional boolean `agentActivityPublishing`:
 * true reports that agent activity publishing is enabled and relay link credentials
 * are configured. False and omission are preserved; older servers can omit this
 * field while still publishing. Available through environment reads, configuration
 * reads and configuration snapshots. Supplied non-boolean values fail decoding.
 * This metadata flag does not configure or publish agent activity.
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
