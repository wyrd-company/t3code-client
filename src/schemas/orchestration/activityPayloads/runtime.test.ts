import { describe, expect, it } from "vite-plus/test";
import { OrchestrationThreadActivity } from "../threadActivity.ts";
import { runtimeActivityPayloads } from "./runtime.ts";

type RuntimeKind = keyof typeof runtimeActivityPayloads;

const linkage = {
  agentKind: "agent",
  taskType: "subagent",
  title: "Review module",
  model: "model-a",
  effort: "high",
  toolUseId: "tool-use-1",
  agentIndex: 0,
  phases: [{ index: 0, title: "Plan" }],
  runHandles: { runId: "run-1", sessionUrl: "https://example.test/session/1" },
};

const samples: ReadonlyArray<readonly [RuntimeKind, string, unknown]> = [
  ["runtime.error", "error", { message: "Provider crashed" }],
  [
    "runtime.warning",
    "info",
    { message: "Retrying request", detail: { attempt: 2, reason: "rate limit" } },
  ],
  [
    "tool.denied",
    "error",
    { toolName: "Bash", toolUseId: "tool-use-2", detail: "Not allowed", agentId: "agent-1" },
  ],
  [
    "turn.plan.updated",
    "info",
    {
      plan: [
        { step: "Read the code", status: "completed" },
        { step: "Write the fix", status: "inProgress" },
      ],
      explanation: null,
    },
  ],
  ["task.started", "info", { taskId: "task-1", detail: "Review the module", ...linkage }],
  [
    "task.progress",
    "info",
    {
      taskId: "task-1",
      detail: "Reading files",
      summary: "Reading files",
      lastToolName: "Read",
      status: "running",
      usage: { input_tokens: 10 },
      ...linkage,
    },
  ],
  [
    "task.updated",
    "info",
    {
      taskId: "task-1",
      detail: "Review the module",
      endedAt: "2026-01-01T00:00:00.000Z",
      isBackgrounded: true,
      status: "idle",
      ...linkage,
    },
  ],
  [
    "task.completed",
    "info",
    {
      taskId: "task-1",
      status: "completed",
      summary: "Done",
      detail: "Done",
      usage: { total_tokens: 30 },
      typedUsage: { totalTokens: 30, outputTokens: 20 },
      ...linkage,
    },
  ],
  [
    "tool.progress",
    "info",
    { taskId: "task-1", toolName: "Bash", toolUseId: "tool-use-3", elapsedSeconds: 1.5 },
  ],
  [
    "tool.started",
    "tool",
    {
      itemType: "command_execution",
      toolCallId: "item-1",
      status: "inProgress",
      title: "Command run",
      detail: "ls -la",
      data: { command: "ls -la", item: { command: "ls -la" } },
    },
  ],
  [
    "tool.updated",
    "tool",
    {
      itemType: "file_change",
      toolCallId: "item-2",
      status: "inProgress",
      title: "File change",
      data: { files: [{ path: "src/example.ts" }], toolCallId: "call-2", kind: "edit" },
    },
  ],
  [
    "tool.completed",
    "tool",
    {
      itemType: "mcp_tool_call",
      toolCallId: "item-3",
      status: "completed",
      title: "MCP tool call",
      toolIcon: { _tag: "website", pageUrl: "https://example.test/" },
      toolSource: { key: "example", name: "Example", kind: "integration" },
      data: {
        item: {
          type: "mcpToolCall",
          id: "item-3",
          tool: "lookup",
          server: "example",
          status: "completed",
          arguments: { query: "value" },
          durationMs: 12,
          result: { content: "3 lines" },
        },
      },
    },
  ],
  [
    "context-compaction",
    "info",
    { state: "compacted", beforeTokens: 90_000, afterTokens: 12_000, requestId: "message-1" },
  ],
  [
    "context-window.updated",
    "info",
    {
      usedTokens: 12_000,
      maxTokens: 200_000,
      inputTokens: 11_000,
      outputTokens: 1_000,
      lastUsedTokens: 500,
      compactsAutomatically: true,
      autoCompactThreshold: 180_000,
    },
  ],
];

function activity(kind: string, tone: string, payload: unknown) {
  return {
    id: `event-${kind}`,
    tone,
    kind,
    summary: "Summary",
    payload,
    turnId: "turn-1",
    sequence: 1,
    createdAt: "2026-01-01T00:00:00.000Z",
  };
}

describe("runtime activity payloads", () => {
  it("has one sample per kind", () => {
    expect(new Set(samples.map(([kind]) => kind))).toEqual(
      new Set(Object.keys(runtimeActivityPayloads)),
    );
  });

  it.each(samples)("decodes %s", (kind, tone, payload) => {
    expect(runtimeActivityPayloads[kind].safeParse(payload).success).toBe(true);
    const decoded = OrchestrationThreadActivity.parse(activity(kind, tone, payload));
    expect(decoded.unknown).toBeUndefined();
    expect(decoded.kind).toBe(kind);
  });

  it("decodes a task usage snapshot row", () => {
    const decoded = runtimeActivityPayloads["task.progress"].parse({
      taskId: "task-1",
      agentKind: "agent",
      usageSnapshot: true,
      typedUsage: { totalTokens: 42 },
    });
    expect(decoded).toMatchObject({ usageSnapshot: true, typedUsage: { totalTokens: 42 } });
  });

  it("decodes a progress row whose detail is empty", () => {
    expect(
      runtimeActivityPayloads["task.progress"].safeParse({
        taskId: "task-1",
        agentKind: "background",
        detail: "",
      }).success,
    ).toBe(true);
  });

  it("decodes a question tool's projected input and a raw output summary", () => {
    const decoded = runtimeActivityPayloads["tool.completed"].parse({
      itemType: "dynamic_tool_call",
      data: {
        toolName: "AskUserQuestion",
        input: { questions: [{ question: "Proceed?" }, { question: null }] },
        rawOutput: { totalFiles: 3, truncated: true },
        imagePath: "assets/example.png",
      },
    });
    expect(decoded.itemType).toBe("dynamic_tool_call");
  });

  it("keeps a newer tool item type", () => {
    expect(
      runtimeActivityPayloads["tool.started"].safeParse({ itemType: "future_tool" }).success,
    ).toBe(true);
  });

  it("rejects a tool payload without an item type", () => {
    const decoded = OrchestrationThreadActivity.parse(
      activity("tool.started", "tool", { title: "Tool" }),
    );
    expect(decoded.unknown).toBe(true);
  });
});
