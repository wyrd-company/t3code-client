// ---
// relationships:
//   implements: mcp
// ---
import {
  isRunTerminalStatus,
  pendingRequests,
  threadPhase,
  type OrchestrationV2ThreadProjection,
  type OrchestrationV2ThreadShell,
  type PendingRequest,
  type ModelSelection,
} from "@wyrd-company/t3code-lib";

export interface ThreadView {
  server: string;
  threadId: string;
  projectId: string;
  title: string;
  status: string;
  phase: string;
  latestRunId: string | null;
  runtimeMode: string;
  modelSelection: ModelSelection;
  settled: boolean;
  archived: boolean;
  updatedAt: string;
  branch: string | null;
  worktreePath: string | null;
}
export interface ProjectionView {
  server: string;
  threadId: string;
  title: string;
  status: string;
  runId: string | null;
  settled: boolean;
  pendingRequests: object[];
}
export function threadView(server: string, thread: OrchestrationV2ThreadShell): ThreadView {
  return {
    server,
    threadId: thread.id,
    projectId: thread.projectId,
    title: thread.title,
    status: thread.status,
    phase: threadPhase(thread),
    latestRunId: thread.latestRunId,
    runtimeMode: thread.runtimeMode,
    modelSelection: thread.modelSelection,
    settled:
      thread.settledOverride === "settled" ||
      (thread.settledOverride !== "active" && thread.settledAt !== null),
    archived: thread.archivedAt !== null,
    updatedAt: thread.updatedAt,
    branch: thread.branch,
    worktreePath: thread.worktreePath,
  };
}
export function requestView(request: PendingRequest): object {
  return request.kind === "user-input"
    ? { kind: request.kind, requestId: request.requestId, questions: request.questions }
    : {
        kind: request.kind,
        requestId: request.requestId,
        detail: request.item?.prompt ?? null,
        decisions: request.item?.options ?? [],
      };
}
export function projectionView(
  server: string,
  projection: OrchestrationV2ThreadProjection,
): ProjectionView {
  const latest = projection.runs.reduce<(typeof projection.runs)[number] | undefined>(
    (a, b) => (!a || b.ordinal > a.ordinal ? b : a),
    undefined,
  );
  const pending = pendingRequests(projection);
  return {
    server,
    threadId: projection.thread.id,
    title: projection.thread.title,
    status: latest?.status ?? "idle",
    runId: latest?.id ?? null,
    settled: pending.length > 0 || (latest !== undefined && isRunTerminalStatus(latest.status)),
    pendingRequests: pending.map(requestView),
  };
}
/** Cut nested text fields too, including tool activity; record each affected item id. */
export function trimItem(
  value: unknown,
  maxChars: number,
  text = true,
): { value: unknown; truncated: boolean } {
  if (typeof value === "string")
    return {
      value: text ? value.slice(0, maxChars) : value,
      truncated: text && value.length > maxChars,
    };
  if (value === null || typeof value !== "object") return { value, truncated: false };
  let truncated = false;
  const entries = Object.entries(value).map(([key, entry]) => {
    const textField =
      /^(text|markdown|explanation|input|output|prompt|message|summary|diffStr|oldStr|newStr|result|arguments|detail|command|question|description)$/.test(
        key,
      );
    const cut = trimItem(entry, maxChars, Array.isArray(value) ? text : textField);
    truncated ||= cut.truncated;
    return [key, cut.value] as const;
  });
  return {
    value: Array.isArray(value) ? entries.map(([, entry]) => entry) : Object.fromEntries(entries),
    truncated,
  };
}
