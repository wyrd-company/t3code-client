// ---
// relationships:
//   verifies: mcp
// ---
import { vi } from "vite-plus/test";
import {
  schemas,
  type StartTurnInput,
  type OrchestrationV2ThreadProjection,
} from "@wyrd-company/t3code-lib";
import { ServerRegistry, type ServerClient } from "../../src/servers/registry.ts";
import type { McpConfig } from "../../src/config/schema.ts";
export const at = "2020-01-01T00:00:00.000Z";
export const model = { instanceId: "sample-provider", model: "sample-model" };
export const appThread = {
  id: "thread-1",
  projectId: "project-1",
  title: "Sample thread",
  providerInstanceId: model.instanceId,
  modelSelection: model,
  runtimeMode: "auto",
  interactionMode: "default",
  branch: null,
  worktreePath: null,
  activeProviderThreadId: null,
  lineage: { parentThreadId: null, relationshipToParent: null, rootThreadId: "thread-1" },
  forkedFrom: null,
  createdAt: at,
  updatedAt: at,
  archivedAt: null,
  settledOverride: null,
  settledAt: null,
  lastVisitedAt: null,
  deletedAt: null,
  createdBy: "agent",
  creationSource: "mcp",
};
export function shell(overrides: Record<string, unknown> = {}) {
  return schemas.orchestrationShell.OrchestrationV2ThreadShell.parse({
    ...appThread,
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
export function projection(
  status = "completed",
  overrides: Record<string, unknown> = {},
): OrchestrationV2ThreadProjection {
  return schemas.orchestrationProjection.OrchestrationV2ThreadProjection.parse({
    thread: appThread,
    runs:
      status === "idle"
        ? []
        : [
            {
              id: "run-1",
              threadId: "thread-1",
              ordinal: 1,
              providerInstanceId: model.instanceId,
              modelSelection: model,
              providerThreadId: null,
              userMessageId: "message-1",
              rootNodeId: null,
              activeAttemptId: null,
              status,
              requestedAt: at,
              startedAt: at,
              completedAt: at,
              checkpointId: null,
              contextHandoffId: null,
            },
          ],
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
export function messageItem(text = "A sample response", type = "assistant_message") {
  return schemas.orchestrationTurnItems.OrchestrationV2ProjectedTurnItems.parse([
    {
      position: 0,
      visibility: "local",
      sourceThreadId: "thread-1",
      sourceItemId: "item-1",
      item: {
        id: "item-1",
        threadId: "thread-1",
        runId: "run-1",
        nodeId: null,
        providerThreadId: null,
        providerTurnId: null,
        nativeItemRef: null,
        parentItemId: null,
        ordinal: 0,
        status: "completed",
        title: null,
        startedAt: at,
        completedAt: at,
        updatedAt: at,
        type,
        text,
        messageId: "message-1",
        streaming: false,
      },
    },
  ]);
}
export function config(overrides: Partial<McpConfig> = {}): McpConfig {
  return {
    servers: { alpha: { url: "https://server.example", tokenEnv: "SAMPLE_TOKEN" } },
    allowTools: ["*"],
    denyTools: [],
    readOnly: false,
    serverPolicies: {},
    ...overrides,
  };
}
export function fakeClient(state = projection()) {
  const threads = {
    list: vi.fn(async () => [shell()]),
    get: vi.fn(async (_id: string): Promise<ReturnType<typeof shell> | undefined> => shell()),
    detail: vi.fn(async () => ({ projection: state, snapshotSequence: 1 })),
    transcript: vi.fn(async () => ({
      threadId: "thread-1",
      title: "Sample",
      updatedAt: at,
      items: messageItem(),
    })),
    launch: vi.fn(async () => ({ threadId: "thread-1", resumed: false, projection: state })),
    startTurn: vi.fn(async (_input: StartTurnInput) => ({ messageId: "message-2", sequence: 2 })),
    interrupt: vi.fn(async () => {}),
    update: vi.fn(async () => {}),
    settle: vi.fn(async () => {}),
    unsettle: vi.fn(async () => {}),
    archive: vi.fn(async () => {}),
    unarchive: vi.fn(async () => {}),
    pendingRequests: vi.fn(async (): Promise<unknown[]> => []),
    respondToUserInput: vi.fn(async () => {}),
    respondToApproval: vi.fn(async () => {}),
    watch: vi.fn(async function* (_id: string, options: { signal: AbortSignal }) {
      yield { kind: "snapshot", snapshot: { snapshotSequence: 1, projection: state } };
      if (options.signal.aborted) return;
      await new Promise<void>((resolve) =>
        options.signal.addEventListener("abort", () => resolve(), { once: true }),
      );
    }),
  };
  const project = { id: "project-1", title: "Sample project", workspaceRoot: "/tmp/sample" };
  const server = {
    getConfig: vi.fn(async () => ({
      environment: { serverVersion: "0.1.0" },
      providers: [{ ...model, models: [] }],
    })),
    environment: vi.fn(async () => ({ serverVersion: "0.1.0" })),
  };
  const projects = {
    get: vi.fn(async () => project),
    list: vi.fn(async () => [project]),
    ensure: vi.fn(async () => project),
    ensureScratch: vi.fn(async () => ({ projectId: project.id })),
  };
  const close = vi.fn(async () => {});
  return {
    client: { server, threads, projects, close } as unknown as ServerClient,
    threads,
    server,
    projects,
    close,
  };
}
export function harness(
  options: Partial<McpConfig> = {},
  state = projection(),
  env: NodeJS.ProcessEnv = { SAMPLE_TOKEN: "sample-credential" },
) {
  const fake = fakeClient(state);
  const registry = new ServerRegistry(config(options), {
    env,
    create: () => fake.client,
  });
  return { ...fake, registry, context: { registry, signal: new AbortController().signal } };
}
