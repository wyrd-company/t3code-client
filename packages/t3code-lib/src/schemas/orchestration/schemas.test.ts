// ---
// relationships:
//   implements: library
// ---
import * as NodeFS from "node:fs";
import { describe, expect, it } from "vite-plus/test";
import { ExecutionEnvironmentDescriptor } from "../environment.ts";
import { ServerProvider } from "../provider.ts";
import { ServerConfig } from "../server.ts";
import { ModelSelection } from "./model.ts";
import { OrchestrationV2NotificationSource } from "./messages.ts";
import { OrchestrationV2ThreadDetailSnapshot } from "./projection.ts";
import { OrchestrationV2PendingBackgroundTask } from "./providerState.ts";
import { OrchestrationV2Subagent } from "./runs.ts";
import { OrchestrationV2ShellSnapshot } from "./shell.ts";
import { OrchestrationV2AppThread } from "./thread.ts";
import { makeAppThread } from "../../../test/support/threadFixtures.ts";

function fixture(name: string): unknown {
  return JSON.parse(
    NodeFS.readFileSync(new URL(`../../../test/fixtures/${name}.json`, import.meta.url), "utf8"),
  );
}

describe("captured server payloads", () => {
  it.each([
    ["server-config", ServerConfig],
    ["environment", ExecutionEnvironmentDescriptor],
    ["orchestration-shell", OrchestrationV2ShellSnapshot],
    ["orchestration-thread-detail", OrchestrationV2ThreadDetailSnapshot],
  ] as const)("decodes %s", (name, schema) => {
    expect(schema.safeParse(fixture(name))).toMatchObject({ success: true });
  });
  it("retains the captured providers rather than silently dropping them", () => {
    const raw = fixture("server-config") as { providers: unknown[] };
    const parsed = ServerConfig.parse(raw);
    expect(parsed.providers).toHaveLength(raw.providers.length);
    for (const provider of raw.providers)
      expect(ServerProvider.safeParse(provider).success).toBe(true);
  });
});

describe("ModelSelection", () => {
  it("promotes legacy provider routing and retains future fields", () => {
    expect(
      ModelSelection.parse({ provider: "example", model: "model-1", future: true }),
    ).toMatchObject({ instanceId: "example", model: "model-1", future: true });
    expect(ModelSelection.parse({ provider: "example", model: "model-1" })).not.toHaveProperty(
      "provider",
    );
    expect(
      ModelSelection.parse({ provider: "old", instanceId: "new", model: "model-1" }).instanceId,
    ).toBe("new");
  });
  it("rejects a selection without a routing key", () => {
    expect(ModelSelection.safeParse({ model: "model-1" }).success).toBe(false);
    expect(
      ModelSelection.safeParse({ instanceId: null, provider: "old", model: "model-1" }).success,
    ).toBe(false);
  });
});

describe("thread records", () => {
  it("passes unknown keys through and decodes unknown literal members as strings", () => {
    const thread = OrchestrationV2AppThread.parse(
      makeAppThread({
        runtimeMode: "future-mode",
        lineage: { parentThreadId: null, relationshipToParent: "future", rootThreadId: "thread-1" },
        futureField: { nested: true },
      }),
    );
    expect(thread.runtimeMode).toBe("future-mode");
    expect(thread.lineage.relationshipToParent).toBe("future");
    expect(thread).toMatchObject({ futureField: { nested: true } });
  });
  it("defaults settlement and visit fields the server may omit", () => {
    const raw = makeAppThread();
    delete raw["settledOverride"];
    delete raw["settledAt"];
    delete raw["lastVisitedAt"];
    expect(OrchestrationV2AppThread.parse(raw)).toMatchObject({
      settledOverride: null,
      settledAt: null,
      lastVisitedAt: null,
    });
  });
  it("decodes an unknown forkedFrom type as unknown and fails a malformed known one", () => {
    const forkedFrom = { type: "future_source", ref: "x" };
    expect(OrchestrationV2AppThread.parse(makeAppThread({ forkedFrom })).forkedFrom).toEqual({
      unknown: true,
      raw: forkedFrom,
    });
    expect(
      OrchestrationV2AppThread.safeParse(makeAppThread({ forkedFrom: { type: "run" } })).success,
    ).toBe(false);
  });
  it("rejects a thread missing a required field", () => {
    const raw = makeAppThread();
    delete raw["projectId"];
    expect(OrchestrationV2AppThread.safeParse(raw).success).toBe(false);
  });
});

describe("OrchestrationV2Subagent", () => {
  it("carries a workflow coordinator's phases and agents", () => {
    const subagent = OrchestrationV2Subagent.parse({
      id: "node-1",
      threadId: "thread-1",
      runId: "run-1",
      parentNodeId: "node-0",
      origin: "provider_native",
      createdBy: "agent",
      driver: "sample-driver",
      providerInstanceId: "instance-1",
      providerThreadId: null,
      childThreadId: null,
      nativeTaskRef: null,
      prompt: "Sample prompt",
      title: null,
      model: null,
      status: "running",
      workflow: {
        phases: [{ index: 0, title: "Gather" }],
        agents: [{ index: 0, label: "Reader", state: "a-future-state", startedAt: 1_000 }],
      },
      result: null,
      startedAt: null,
      completedAt: null,
      updatedAt: "2026-01-01T00:00:00.000Z",
    });
    expect(subagent.workflow?.agents[0]).toMatchObject({
      label: "Reader",
      state: "a-future-state",
    });
  });
});

describe("OrchestrationV2NotificationSource", () => {
  it("reads the legacy subagent and command shapes into the plain kinds", () => {
    expect(
      OrchestrationV2NotificationSource.parse({
        kind: "background_task",
        work: "subagent",
        childThreadId: "thread-2",
      }),
    ).toEqual({ kind: "subagent", childThreadId: "thread-2" });
    expect(OrchestrationV2NotificationSource.parse({ kind: "background_task" })).toEqual({
      kind: "background_task",
    });
    expect(OrchestrationV2NotificationSource.parse({ kind: "background_command" })).toEqual({
      kind: "command",
    });
  });
  it("keeps the plain kinds and task ids", () => {
    expect(
      OrchestrationV2NotificationSource.parse({ kind: "delegated_task", taskIds: ["node-1"] }),
    ).toEqual({ kind: "delegated_task", taskIds: ["node-1"] });
    expect(OrchestrationV2NotificationSource.parse({ kind: "subagent" })).toEqual({
      kind: "subagent",
    });
    expect(OrchestrationV2NotificationSource.parse({ kind: "command" })).toEqual({
      kind: "command",
    });
    expect(OrchestrationV2NotificationSource.parse({ kind: "monitor" })).toEqual({
      kind: "monitor",
    });
    expect(OrchestrationV2NotificationSource.parse({ kind: "system" })).toEqual({
      kind: "system",
    });
  });
  it("reads an unknown kind as background_task", () => {
    expect(OrchestrationV2NotificationSource.parse({ kind: "future_kind", extra: 1 })).toEqual({
      kind: "background_task",
    });
  });
  it("rejects a source without a kind", () => {
    expect(OrchestrationV2NotificationSource.safeParse({ work: "subagent" }).success).toBe(false);
  });
});

describe("OrchestrationV2PendingBackgroundTask", () => {
  it("keeps a known kind and its child thread", () => {
    expect(
      OrchestrationV2PendingBackgroundTask.parse({
        taskId: "task-1",
        kind: "subagent",
        childThreadId: "thread-2",
      }),
    ).toEqual({ taskId: "task-1", kind: "subagent", childThreadId: "thread-2" });
  });
  it("reads an unknown or missing kind as background_task", () => {
    expect(
      OrchestrationV2PendingBackgroundTask.parse({ taskId: "task-1", kind: "future_kind" }),
    ).toEqual({ taskId: "task-1", kind: "background_task" });
    expect(
      OrchestrationV2PendingBackgroundTask.parse({ taskId: "task-1", description: "Build" }),
    ).toEqual({ taskId: "task-1", description: "Build", kind: "background_task" });
  });
  it("rejects a task without an id", () => {
    expect(OrchestrationV2PendingBackgroundTask.safeParse({ kind: "command" }).success).toBe(false);
  });
});
