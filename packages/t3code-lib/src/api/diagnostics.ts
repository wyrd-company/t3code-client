// ---
// relationships:
//   implements: library
// ---
import type { RpcClient } from "../rpc/client.ts";
import type { RpcMethods } from "../rpc/registry.ts";
import type {
  ServerProcessDiagnosticsResult,
  ServerTraceDiagnosticsResult,
} from "../schemas/diagnostics.ts";
import type {
  HostResourcesSnapshot,
  ResourceTelemetryHistory,
  ResourceTelemetryHistoryInput,
} from "../schemas/resourceTelemetry.ts";
import type { StorageCleanupReportUpdate } from "../schemas/storageCleanup.ts";
import { firstItem, unwrapStreamItems } from "./streamItems.ts";

/**
 * Read-only views of the server's own health: trace summaries, its process tree,
 * host resources, resource history and the latest storage cleanup report. None of
 * these signal a process, run a cleanup or restart the resource monitor; those stay
 * on `client.rpc`. Trace causes, log messages and command lines are text that other
 * programs wrote, and can hold host paths.
 */
export class DiagnosticsApi {
  readonly rpc: RpcClient<RpcMethods>;

  constructor(rpc: RpcClient<RpcMethods>) {
    this.rpc = rpc;
  }

  /**
   * Span and failure summaries from the server's trace files (diagnostics:read). A
   * read failure keeps the partial counts and sets `error`.
   */
  traces(signal?: AbortSignal): Promise<ServerTraceDiagnosticsResult> {
    return this.rpc.call("server.getTraceDiagnostics", {}, signal);
  }

  /** The server process and its descendants, with CPU and memory (diagnostics:read). */
  processes(signal?: AbortSignal): Promise<ServerProcessDiagnosticsResult> {
    return this.rpc.call("server.getProcessDiagnostics", {}, signal);
  }

  /** CPU and memory of the server host (orchestration:read). */
  hostResources(signal?: AbortSignal): Promise<HostResourcesSnapshot> {
    return this.rpc.call("server.getHostResources", {}, signal);
  }

  /**
   * Resource use of the server's processes over `windowMs`, in buckets of
   * `bucketMs`, with the top processes and monitor health (diagnostics:read).
   */
  resourceHistory(
    input: ResourceTelemetryHistoryInput,
    signal?: AbortSignal,
  ): Promise<ResourceTelemetryHistory> {
    return this.rpc.call("server.getResourceTelemetryHistory", input, signal);
  }

  /**
   * The latest storage cleanup report, or `null` before the first cleanup
   * (orchestration:read). Reads the first item of the report stream and closes it.
   */
  storageCleanupReport(signal?: AbortSignal): Promise<StorageCleanupReportUpdate> {
    return firstItem(
      unwrapStreamItems(
        this.rpc.stream(
          "server.getStorageCleanupReport",
          {},
          signal === undefined ? {} : { signal },
        ),
      ),
      "storage cleanup report",
    );
  }
}
