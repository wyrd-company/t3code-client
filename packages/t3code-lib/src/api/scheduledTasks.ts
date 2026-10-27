// ---
// relationships:
//   implements: library
// ---
import { T3AuthError, T3NotFoundError, T3PreconditionError } from "../errors.ts";
import type { RpcClient } from "../rpc/client.ts";
import type { RpcMethods } from "../rpc/registry.ts";
import { isUnknownVariant, type ScheduledTaskId } from "../schemas/common.ts";
import type {
  ScheduledTask,
  ScheduledTaskListResult,
  ScheduledTaskUpsertInput,
  ScheduledTaskWebhookDelivery,
  ScheduledTaskWebhookDeliveryId,
  ScheduledTaskWebhookDeliverySummary,
} from "../schemas/scheduledTask.ts";
import { scheduledTaskUpdateInput, type ScheduledTaskPatch } from "./scheduledTaskUpdate.ts";
import { unwrapStreamItems, type DecodedStreamItem } from "./streamItems.ts";

export type { ScheduledTaskPatch } from "./scheduledTaskUpdate.ts";

/** The project and optional existing thread a scheduled task will use. */
export type ScheduledTaskTarget = Pick<ScheduledTaskUpsertInput, "projectId" | "threadId">;

export interface WatchScheduledTasksOptions {
  readonly signal?: AbortSignal;
}

/** Where a webhook task receives requests. */
export interface ScheduledTaskWebhookEndpointInfo {
  readonly taskId: ScheduledTaskId;
  /** Environment-relative path; it carries the URL token. */
  readonly path: string;
  /** `path` resolved against this client's server URL. Reachability is not checked. */
  readonly url: string;
  /** The T3 Connect relay URL, or null when the environment has none. */
  readonly connectUrl: string | null;
  /** `true` when requests must carry a valid signature. */
  readonly hasSecret: boolean;
}

export interface ScheduledTasksApiOptions {
  /** The server URL the client was created with. */
  readonly baseUrl: string;
  /** The credential's scopes, or undefined while they are unknown. */
  readonly getScopes?: () => readonly string[] | undefined;
}

const OPERATE_SCOPE = "orchestration:operate";

/**
 * Scheduled tasks: interval, fixed-time and webhook triggers that start agent
 * runs. Reading needs orchestration:read; the server removes webhook endpoints
 * from a reader's results. Mutations, webhook endpoints and delivery records
 * need orchestration:operate. Signing secrets are write-only.
 */
export class ScheduledTasksApi {
  readonly rpc: RpcClient<RpcMethods>;
  readonly #baseUrl: string;
  readonly #getScopes: () => readonly string[] | undefined;

  constructor(rpc: RpcClient<RpcMethods>, options: ScheduledTasksApiOptions) {
    this.rpc = rpc;
    this.#baseUrl = options.baseUrl;
    this.#getScopes = options.getScopes ?? (() => undefined);
  }

  /** Every task this client can decode; a task with an unfamiliar shape is left out. */
  async list(signal?: AbortSignal): Promise<ScheduledTask[]> {
    return (await this.rpc.call("scheduledTasks.list", {}, signal)).tasks;
  }

  /** One task, or undefined when no task has `id`. */
  async get(id: ScheduledTaskId, signal?: AbortSignal): Promise<ScheduledTask | undefined> {
    return (await this.list(signal)).find((task) => task.id === id);
  }

  /** Create a task, or replace one by `id`, with the server's upsert semantics. */
  async upsert(input: ScheduledTaskUpsertInput, signal?: AbortSignal): Promise<ScheduledTask> {
    return (await this.rpc.call("scheduledTasks.upsert", input, signal)).task;
  }

  /**
   * Change the given properties of an existing task and keep the rest. This
   * reads the task and then saves it with `requireExisting: true`; a task
   * deleted in between fails, and a concurrent edit is overwritten.
   */
  async update(
    id: ScheduledTaskId,
    patch: ScheduledTaskPatch,
    signal?: AbortSignal,
  ): Promise<ScheduledTask> {
    this.#requireOperate("scheduledTasks.update");
    const stored = await this.#require(id, "update", signal);
    const input = scheduledTaskUpdateInput(stored, patch);
    if (input.projectId !== stored.projectId || input.threadId !== stored.threadId)
      await this.validateTarget(input, signal);
    return this.upsert(input, signal);
  }

  /**
   * Check that an existing target thread belongs to the selected project.
   * A null or omitted thread starts a new thread per run and needs no read.
   * Bound threads use orchestration:read; missing threads, permission errors
   * and cancellation propagate. Native upsert remains a thin operate-only call.
   */
  async validateTarget(input: ScheduledTaskTarget, signal?: AbortSignal): Promise<void> {
    if (input.threadId == null) return;
    const projection = await this.rpc.call(
      "orchestration.getThreadProjection",
      { threadId: input.threadId },
      signal,
    );
    if (projection.thread.projectId !== input.projectId)
      throw new T3PreconditionError("The scheduled task's thread must belong to its project.");
  }

  /** Enable or disable a task without changing its execution settings. */
  async setEnabled(
    id: ScheduledTaskId,
    enabled: boolean,
    signal?: AbortSignal,
  ): Promise<ScheduledTask> {
    return (await this.rpc.call("scheduledTasks.setEnabled", { id, enabled }, signal)).task;
  }

  /** Delete a scheduled task through the server's native mutation. */
  async delete(id: ScheduledTaskId, signal?: AbortSignal): Promise<void> {
    await this.rpc.call("scheduledTasks.delete", { id }, signal);
  }

  /** Start a run now. The server refuses webhook tasks and a task that is already running. */
  async runNow(id: ScheduledTaskId, signal?: AbortSignal): Promise<ScheduledTask> {
    return (await this.rpc.call("scheduledTasks.runNow", { id }, signal)).task;
  }

  /** Replace a webhook task's URL token; the previous URL stops working. */
  async rotateWebhookToken(id: ScheduledTaskId, signal?: AbortSignal): Promise<ScheduledTask> {
    return (await this.rpc.call("scheduledTasks.rotateWebhookToken", { id }, signal)).task;
  }

  /** Recorded webhook requests; outcomes newer than this client stay strings. */
  async listWebhookDeliveries(
    id: ScheduledTaskId,
    signal?: AbortSignal,
  ): Promise<ScheduledTaskWebhookDeliverySummary[]> {
    const payload = { id, acceptAnyOutcome: true };
    return (await this.rpc.call("scheduledTasks.listWebhookDeliveries", payload, signal))
      .deliveries;
  }

  /** Read one webhook request's diagnostic record, including its body and headers. */
  async getWebhookDelivery(
    id: ScheduledTaskId,
    deliveryId: ScheduledTaskWebhookDeliveryId,
    signal?: AbortSignal,
  ): Promise<ScheduledTaskWebhookDelivery> {
    const payload = { id, deliveryId, acceptAnyOutcome: true };
    return (await this.rpc.call("scheduledTasks.getWebhookDelivery", payload, signal)).delivery;
  }

  /** The full task list now and after every change; decode failures remain stream items. */
  watch(
    options: WatchScheduledTasksOptions = {},
  ): AsyncIterable<DecodedStreamItem<ScheduledTaskListResult>> {
    return unwrapStreamItems(
      this.rpc.stream(
        "scheduledTasks.subscribe",
        {},
        options.signal === undefined ? undefined : { signal: options.signal },
      ),
    );
  }

  /**
   * A webhook task's endpoint. A missing task fails as not found and another
   * trigger type as a precondition. A caller without orchestration:operate
   * fails with insufficient scope; the endpoint is never reconstructed.
   */
  async webhookEndpoint(
    id: ScheduledTaskId,
    signal?: AbortSignal,
  ): Promise<ScheduledTaskWebhookEndpointInfo> {
    const context = "scheduledTasks.webhookEndpoint";
    this.#requireOperate(context);
    const task = await this.#require(id, "webhookEndpoint", signal);
    const schedule = task.schedule;
    if (isUnknownVariant<"type">(schedule) || schedule.type !== "webhook") {
      throw new T3PreconditionError(`Scheduled task ${id} is not a webhook task.`);
    }
    // The server leaves the endpoint out for callers without orchestration:operate.
    if (task.webhook === undefined) throw T3AuthError.insufficientScope(OPERATE_SCOPE, context);
    return {
      taskId: task.id,
      path: task.webhook.path,
      url: this.#resolve(task.webhook.path),
      connectUrl: task.webhook.url,
      hasSecret: task.webhook.hasSecret,
    };
  }

  #resolve(path: string): string {
    try {
      return new URL(path, this.#baseUrl).href;
    } catch (cause) {
      throw new T3PreconditionError(`baseUrl is not a valid URL: ${this.#baseUrl}`, { cause });
    }
  }

  #requireOperate(context: string): void {
    const scopes = this.#getScopes();
    if (scopes && !scopes.includes(OPERATE_SCOPE)) {
      throw T3AuthError.insufficientScope(OPERATE_SCOPE, context);
    }
  }

  async #require(
    id: ScheduledTaskId,
    operation: string,
    signal: AbortSignal | undefined,
  ): Promise<ScheduledTask> {
    const task = await this.get(id, signal);
    if (task !== undefined) return task;
    throw new T3NotFoundError(`Scheduled task ${id} does not exist.`, {
      status: 404,
      method: "LOCAL",
      path: `scheduledTasks.${operation}`,
      body: undefined,
      reason: "scheduled_task_not_found",
    });
  }
}
