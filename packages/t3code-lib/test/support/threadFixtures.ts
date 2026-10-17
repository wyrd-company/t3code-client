/**
 * Builders for V2 orchestration records and wire-shaped stream items, for
 * unit tests of the projection, the thread watch, and the facades. Values are
 * parsed through the schemas so defaults are filled the way the client sees
 * them. All ids are generic placeholders.
 */
import {
  messageId,
  nodeId,
  projectId,
  runId,
  runtimeRequestId,
  threadId,
  turnItemId,
} from "../../src/schemas/common.ts";
import { OrchestrationV2DomainEvent } from "../../src/schemas/orchestration/events.ts";
import {
  OrchestrationV2ThreadProjection,
  type OrchestrationV2ThreadDetailSnapshot,
} from "../../src/schemas/orchestration/projection.ts";
import {
  OrchestrationProjectShell,
  OrchestrationV2ShellSnapshot,
  OrchestrationV2ThreadShell,
} from "../../src/schemas/orchestration/shell.ts";

export const ids = {
  threadId: threadId("thread-1"),
  projectId: projectId("project-1"),
  runId: runId("run-1"),
  messageId: messageId("message-1"),
  nodeId: nodeId("node-1"),
  itemId: turnItemId("item-1"),
  requestId: runtimeRequestId("request-1"),
};

export const at = "2020-01-01T00:00:00.000Z";
export const modelSelection = { instanceId: "sample-provider", model: "sample-model" };

/** The app thread record as the server stores it. */
export function makeAppThread(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    createdBy: "user",
    creationSource: "web",
    id: ids.threadId,
    projectId: ids.projectId,
    title: "Sample thread",
    providerInstanceId: "sample-provider",
    modelSelection,
    runtimeMode: "auto",
    interactionMode: "default",
    branch: null,
    worktreePath: null,
    activeProviderThreadId: null,
    lineage: { parentThreadId: null, relationshipToParent: null, rootThreadId: ids.threadId },
    forkedFrom: null,
    createdAt: at,
    updatedAt: at,
    archivedAt: null,
    settledOverride: null,
    settledAt: null,
    lastVisitedAt: null,
    deletedAt: null,
    ...overrides,
  };
}

export function makeRun(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: ids.runId,
    threadId: ids.threadId,
    ordinal: 1,
    providerInstanceId: "sample-provider",
    modelSelection,
    providerThreadId: null,
    userMessageId: ids.messageId,
    rootNodeId: null,
    activeAttemptId: null,
    status: "running",
    requestedAt: at,
    startedAt: at,
    completedAt: null,
    checkpointId: null,
    contextHandoffId: null,
    ...overrides,
  };
}

export function makeMessage(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    createdBy: "user",
    creationSource: "web",
    id: ids.messageId,
    threadId: ids.threadId,
    runId: ids.runId,
    nodeId: null,
    role: "user",
    text: "Say pong.",
    attachments: [],
    streaming: false,
    createdAt: at,
    updatedAt: at,
    ...overrides,
  };
}

const turnItemBase = {
  threadId: ids.threadId,
  runId: ids.runId,
  nodeId: null,
  providerThreadId: null,
  providerTurnId: null,
  nativeItemRef: null,
  parentItemId: null,
  ordinal: 1,
  status: "running",
  title: null,
  startedAt: at,
  completedAt: null,
  updatedAt: at,
};

export function makeTurnItem(
  type: string,
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return { ...turnItemBase, id: ids.itemId, type, ...overrides };
}

export const items = {
  assistantMessage: (text: string, streaming = true, extra: Record<string, unknown> = {}) =>
    makeTurnItem("assistant_message", { messageId: "message-2", text, streaming, ...extra }),
  approvalRequest: (requestId: string, extra: Record<string, unknown> = {}) =>
    makeTurnItem("approval_request", {
      id: `item-${requestId}`,
      requestId,
      requestKind: "command",
      prompt: "run sample",
      ...extra,
    }),
  userInputRequest: (requestId: string, extra: Record<string, unknown> = {}) =>
    makeTurnItem("user_input_request", {
      id: `item-${requestId}`,
      requestId,
      questions: [
        {
          id: "q1",
          header: "Proceed",
          question: "Proceed?",
          options: [{ label: "yes", description: "Go ahead" }],
        },
      ],
      ...extra,
    }),
  error: (message: string, extra: Record<string, unknown> = {}) =>
    makeTurnItem("error", {
      id: "item-error",
      status: "failed",
      failure: { class: "provider_error", message, code: null, retryable: null },
      ...extra,
    }),
};

export function makeRuntimeRequest(
  requestId: string,
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    id: requestId,
    nodeId: ids.nodeId,
    providerTurnId: null,
    nativeRequestRef: null,
    kind: "command",
    status: "pending",
    responseCapability: { type: "message" },
    createdAt: at,
    resolvedAt: null,
    ...overrides,
  };
}

export function makeProjection(
  overrides: Record<string, unknown> = {},
): OrchestrationV2ThreadProjection {
  return OrchestrationV2ThreadProjection.parse({
    thread: makeAppThread(),
    runs: [],
    attempts: [],
    nodes: [],
    subagents: [],
    providerSessions: [],
    providerThreads: [],
    providerTurns: [],
    runtimeRequests: [],
    messages: [],
    plans: [],
    turnItems: [],
    checkpointScopes: [],
    checkpoints: [],
    contextHandoffs: [],
    contextTransfers: [],
    visibleTurnItems: [],
    updatedAt: at,
    ...overrides,
  });
}

export function makeSnapshot(
  projection: OrchestrationV2ThreadProjection,
  snapshotSequence: number,
): OrchestrationV2ThreadDetailSnapshot {
  return { snapshotSequence, projection };
}

export function makeShellThread(
  overrides: Record<string, unknown> = {},
): OrchestrationV2ThreadShell {
  return OrchestrationV2ThreadShell.parse({
    ...makeAppThread(),
    latestRunId: null,
    activeRunId: null,
    status: "idle",
    pendingRuntimeRequest: null,
    latestVisibleMessage: null,
    latestUserMessageAt: null,
    hasActionableProposedPlan: false,
    itemCount: 0,
    visibleItemCount: 0,
    ...overrides,
  });
}

export function makeShellProject(
  overrides: Record<string, unknown> = {},
): OrchestrationProjectShell {
  return OrchestrationProjectShell.parse({
    id: ids.projectId,
    title: "Sample project",
    workspaceRoot: "/srv/sample",
    defaultModelSelection: null,
    scripts: [],
    createdAt: at,
    updatedAt: at,
    ...overrides,
  });
}

export function makeShellSnapshot(input: {
  projects?: OrchestrationProjectShell[];
  threads?: OrchestrationV2ThreadShell[];
  archivedThreads?: OrchestrationV2ThreadShell[];
  snapshotSequence?: number;
}): OrchestrationV2ShellSnapshot {
  return OrchestrationV2ShellSnapshot.parse({
    schemaVersion: 1,
    snapshotSequence: input.snapshotSequence ?? 1,
    projects: input.projects ?? [],
    threads: input.threads ?? [],
    archivedThreads: input.archivedThreads ?? [],
  });
}

/** A wire-shaped domain event, as the server sends it inside a stream item. */
export function rawEvent(
  sequence: number,
  type: string,
  payload: Record<string, unknown>,
): Record<string, unknown> {
  return { id: `event-${sequence}`, threadId: ids.threadId, occurredAt: at, type, payload };
}

/** A wire-shaped `{ kind: "event" }` stream item. */
export function eventItem(
  sequence: number,
  type: string,
  payload: Record<string, unknown>,
): Record<string, unknown> {
  return { kind: "event", sequence, event: rawEvent(sequence, type, payload) };
}

export function snapshotItem(
  sequence: number,
  projection: OrchestrationV2ThreadProjection = makeProjection(),
): Record<string, unknown> {
  return { kind: "snapshot", snapshotSequence: sequence, projection };
}

export function parseEvent(raw: Record<string, unknown>): OrchestrationV2DomainEvent {
  return OrchestrationV2DomainEvent.parse(raw);
}

export const events = {
  runCreated: (sequence: number, run: Record<string, unknown> = {}) =>
    eventItem(sequence, "run.created", makeRun(run)),
  runUpdated: (sequence: number, run: Record<string, unknown> = {}) =>
    eventItem(sequence, "run.updated", makeRun(run)),
  messageUpdated: (sequence: number, message: Record<string, unknown> = {}) =>
    eventItem(sequence, "message.updated", makeMessage(message)),
  turnItemUpdated: (sequence: number, item: Record<string, unknown>) =>
    eventItem(sequence, "turn-item.updated", item),
  runtimeRequestUpdated: (
    sequence: number,
    requestId: string,
    request: Record<string, unknown> = {},
  ) => eventItem(sequence, "runtime-request.updated", makeRuntimeRequest(requestId, request)),
  threadState: (sequence: number, type: string, thread: Record<string, unknown> = {}) =>
    eventItem(sequence, type, makeAppThread(thread)),
  pullRequestLinkUpdated: (sequence: number, link: Record<string, unknown>) =>
    eventItem(sequence, "thread.pull-request-link-updated", link),
};

/** A linked pull request on a generic host. */
export function makePullRequestLink(
  number: number,
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    host: "git.example.test",
    repository: "sample/repo",
    number,
    url: `https://git.example.test/sample/repo/pull/${number}`,
    source: "manual",
    linkedAt: at,
    snapshot: null,
    stack: null,
    ...overrides,
  };
}

/** The items a finished run produces: an assistant reply streamed in two parts, then completion. */
export function completedRunItems(from: number, text = "pong"): Record<string, unknown>[] {
  const half = Math.ceil(text.length / 2);
  return [
    events.runCreated(from),
    events.messageUpdated(from + 1),
    events.turnItemUpdated(from + 2, items.assistantMessage(text.slice(0, half))),
    events.turnItemUpdated(from + 3, items.assistantMessage(text)),
    events.turnItemUpdated(from + 4, items.assistantMessage(text, false, { status: "completed" })),
    events.messageUpdated(from + 5, {
      id: "message-2",
      role: "assistant",
      text,
      createdBy: "agent",
      creationSource: "provider",
    }),
    events.runUpdated(from + 6, { status: "completed", completedAt: at }),
  ];
}
