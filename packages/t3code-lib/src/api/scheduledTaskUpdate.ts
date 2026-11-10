// ---
// relationships:
//   implements: library
// ---
/**
 * Builds the upsert payload for `ScheduledTasksApi.update`: the stored task
 * with the patch laid over it. The server replaces the whole task on upsert,
 * so every omitted property is copied from the stored task.
 */
import { T3PreconditionError } from "../errors.ts";
import { isKnownLiteral, isUnknownVariant } from "../schemas/common.ts";
import type {
  ScheduledTask,
  ScheduledTaskUpsertInput,
  ScheduledTaskUpsertSchedule,
  ScheduledTaskWebhookSchedule,
} from "../schemas/scheduledTask.ts";

const SIGNATURE_ENCODINGS = ["hex", "base64"] as const;

/** Properties `update` changes; omitted properties keep their stored values. */
export type ScheduledTaskPatch = Partial<
  Pick<
    ScheduledTaskUpsertInput,
    | "title"
    | "prompt"
    | "enabled"
    | "schedule"
    | "projectId"
    | "threadId"
    | "threadMode"
    | "workspaceStrategy"
    | "modelSelection"
    | "runtimeMode"
    | "interactionMode"
  >
>;

/** The upsert payload that applies `patch` to `stored`, with `requireExisting: true`. */
export function scheduledTaskUpdateInput(
  stored: ScheduledTask,
  patch: ScheduledTaskPatch,
): ScheduledTaskUpsertInput {
  return {
    id: stored.id,
    requireExisting: true,
    title: patch.title ?? stored.title,
    prompt: patch.prompt ?? stored.prompt,
    enabled: patch.enabled ?? stored.enabled,
    schedule: updatedSchedule(stored, patch.schedule),
    projectId: patch.projectId ?? stored.projectId,
    threadId: patch.threadId === undefined ? stored.threadId : patch.threadId,
    ...threadModeUpdate(stored, patch),
    workspaceStrategy: patch.workspaceStrategy ?? stored.workspaceStrategy,
    modelSelection: patch.modelSelection ?? stored.modelSelection,
    runtimeMode: patch.runtimeMode ?? stored.runtimeMode,
    interactionMode: patch.interactionMode ?? stored.interactionMode,
    createdBy: stored.createdBy,
    // The server stamps an omitted creation source as "web".
    creationSource: stored.creationSource,
  };
}

/**
 * An omitted mode keeps the stored one, so a null thread alone would not leave
 * a one-thread mode. A stored task without a mode is a pre-mode server's: bound
 * means `continue`. A patch with `threadId: null` and no mode sends
 * `new_thread`; any other patch sends only the mode it sets.
 */
function threadModeUpdate(
  stored: ScheduledTask,
  patch: ScheduledTaskPatch,
): Pick<ScheduledTaskUpsertInput, "threadMode"> {
  if (patch.threadMode !== undefined) return { threadMode: patch.threadMode };
  const storedMode = stored.threadMode ?? (stored.threadId === null ? "new_thread" : "continue");
  if (patch.threadId === null && storedMode !== "new_thread") return { threadMode: "new_thread" };
  return {};
}

/**
 * The server clears an omitted signature and delivery-age bound, so they are
 * copied from a stored webhook trigger unless the patch sets them (null
 * clears). Dedupe and filters stay omitted: the server keeps the stored ones,
 * and `filters: []` clears them. An omitted signing secret keeps the stored secret.
 */
function updatedSchedule(
  stored: ScheduledTask,
  patch: ScheduledTaskUpsertSchedule | undefined,
): ScheduledTaskUpsertSchedule {
  const current = stored.schedule;
  const storedWebhook =
    !isUnknownVariant<"type">(current) && current.type === "webhook" ? current : undefined;
  if (patch !== undefined) {
    if (patch.type !== "webhook" || storedWebhook === undefined) return patch;
    return {
      ...patch,
      signature: patch.signature === undefined ? storedSignature(storedWebhook) : patch.signature,
      maxDeliveryAgeMinutes:
        patch.maxDeliveryAgeMinutes === undefined
          ? (storedWebhook.maxDeliveryAgeMinutes ?? null)
          : patch.maxDeliveryAgeMinutes,
    };
  }
  if (isUnknownVariant<"type">(current)) {
    throw new T3PreconditionError(
      `Scheduled task ${stored.id} has a ${current.raw.type} trigger this client cannot resend; pass a schedule.`,
    );
  }
  switch (current.type) {
    case "interval":
      return { type: "interval", everyMs: current.everyMs };
    case "fixed_time":
      return {
        type: "fixed_time",
        timeOfDay: current.timeOfDay,
        ...(current.weekdays === undefined ? {} : { weekdays: current.weekdays }),
      };
    case "once":
      return { type: "once", runAt: current.runAt };
    case "webhook":
      return {
        type: "webhook",
        signature: storedSignature(current),
        maxDeliveryAgeMinutes: current.maxDeliveryAgeMinutes ?? null,
      };
  }
}

function storedSignature(
  schedule: ScheduledTaskWebhookSchedule,
): Extract<ScheduledTaskUpsertSchedule, { type: "webhook" }>["signature"] {
  const signature = schedule.signature;
  if (signature === null) return null;
  const { header, encoding, prefix } = signature;
  if (isKnownLiteral(SIGNATURE_ENCODINGS, encoding)) return { header, encoding, prefix };
  throw new T3PreconditionError(
    `The stored signature encoding ${encoding} cannot be resent; pass a signature.`,
  );
}
