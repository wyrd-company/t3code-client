// ---
// relationships:
//   verifies: mcp
// ---
import { schemas, T3ConnectionError, threadId, scheduledTaskId } from "@wyrd-company/t3code-lib";
import { afterEach, expect, it, vi } from "vite-plus/test";
import { closeProtocolFixtures, protocolFixture as fixture } from "../support/protocolFixture.ts";
import { toolNames } from "../../src/tools/index.ts";

afterEach(closeProtocolFixtures);

it("negotiates and advertises only the complementary tool contract with accurate annotations", async () => {
  const { client, provider } = await fixture();
  expect(client.getServerVersion()?.name).toBe("t3code-mcp");
  const { tools } = await client.listTools();
  expect(tools.map((tool) => tool.name)).toEqual(toolNames);
  expect(tools).toHaveLength(30);
  const usageDescription = tools.find((tool) => tool.name === "usage_summary")?.description;
  expect(usageDescription).toContain("provisional: true to use the last scan");
  expect(usageDescription).toContain("awaitRefresh: true to wait for slow sources to refresh");
  const destructive = [
    "configure_scheduled_task",
    "rotate_scheduled_task_webhook",
    "thread_stop",
    "thread_force_stop",
    "thread_queue_resume",
    "thread_queue_start",
    "stop_local_server",
  ];
  const idempotentWrite = ["thread_tag"];
  for (const tool of tools) {
    const read = !destructive.includes(tool.name) && !idempotentWrite.includes(tool.name);
    expect(tool.annotations, tool.name).toEqual({
      readOnlyHint: read,
      destructiveHint: destructive.includes(tool.name),
      idempotentHint: !destructive.includes(tool.name),
      openWorldHint: true,
    });
  }
  expect(provider.get).not.toHaveBeenCalled();
});

it("returns matching structured/text values and forwards provider and usage selection", async () => {
  const { client, upstream } = await fixture();
  const record = schemas.provider.ServerProvider.parse({
    instanceId: "sample-provider",
    driver: "codex",
    enabled: true,
    installed: true,
    version: "1.0.0",
    status: "ready",
    auth: { status: "authenticated", endpoint: "https://models.invalid" },
    checkedAt: "2026-01-01T00:00:00Z",
    models: [],
    usageLimits: {
      checkedAt: "2026-01-01T00:00:00Z",
      zeroSpendCap: true,
      windows: [
        {
          id: "sample-window",
          kind: "weekly",
          label: "Weekly",
          usedPercent: 0,
          modelIds: ["sample-model"],
          providerIds: ["codex"],
        },
      ],
    },
  });
  const status = vi.spyOn(upstream.server, "providerStatus").mockResolvedValue([record]);
  const result = await client.callTool({
    name: "provider_status",
    arguments: { instanceId: "sample-provider" },
  });
  expect(status).toHaveBeenCalledWith("sample-provider", expect.any(AbortSignal));
  expect(result.structuredContent).toEqual({ providers: [record] });
  expect(result.content).toEqual([
    { type: "text", text: JSON.stringify(result.structuredContent) },
  ]);
  const summary = vi
    .spyOn(upstream.server, "usageSummary")
    .mockRejectedValue(new T3ConnectionError("closed", "sample-sensitive-body"));
  const input = {
    sinceDay: "2026-01-01",
    untilDay: "2026-01-02",
    timeZone: "Etc/UTC",
    awaitRefresh: true,
    provisional: true,
  };
  const failed = await client.callTool({ name: "usage_summary", arguments: input });
  expect(summary).toHaveBeenCalledWith(input, expect.any(AbortSignal));
  expect(failed).toMatchObject({
    isError: true,
    structuredContent: { error: { code: "connection" } },
  });
  expect(JSON.stringify(failed)).not.toContain("sample-sensitive-body");
});

it("preserves unpriced token counts and physical source identities in usage summaries", async () => {
  const { client, upstream } = await fixture();
  const window = { sinceDay: "2026-01-01", untilDay: "2026-01-01", timeZone: "Etc/UTC" };
  const data = schemas.usage.UsageSummary.parse({
    ...window,
    contractVersion: 6,
    readAt: "2026-01-02T00:00:00Z",
    buckets: [
      {
        day: window.sinceDay,
        provider: "codex",
        model: "sample-model",
        totals: {
          uncachedInputTokens: 5,
          cachedInputTokens: 0,
          cacheCreationTokens: 0,
          outputTokens: 0,
          reasoningTokens: 0,
        },
        costUsd: 0,
        cacheSavingsUsd: 0,
        costSource: "unpriced",
        records: 1,
        unpricedRecords: 1,
        unpricedTokens: 5,
        sessions: 1,
      },
    ],
    sources: [
      {
        fingerprint: {
          hostId: "sample-host",
          provider: "codex",
          resolvedHomePath: "/sample",
          volumeId: "1:2",
          physicalSourceId: "sample-source",
        },
        status: "ok",
        scannedFiles: 1,
        skippedFiles: 0,
        malformedRecords: 0,
        distinctSessions: 1,
        message: null,
      },
    ],
    pricing: { status: "unavailable", source: "sample", fetchedAt: null, knownModels: 0 },
    scanDurationMs: 1,
  });
  vi.spyOn(upstream.server, "usageSummary").mockResolvedValue(data);
  const result = await client.callTool({ name: "usage_summary", arguments: window });
  expect(result.structuredContent).toMatchObject({
    buckets: [{ unpricedTokens: 5 }],
    sources: [{ fingerprint: { physicalSourceId: "sample-source" } }],
  });
});

it("forwards scheduler execution patches without absent fields and rotates before reading endpoint", async () => {
  const { client, upstream } = await fixture();
  const update = vi
    .spyOn(upstream.scheduledTasks, "update")
    .mockRejectedValue(new Error("sample-body"));
  await client.callTool({
    name: "configure_scheduled_task",
    arguments: { id: "sample-task", configuration: { threadId: null } },
  });
  expect(update).toHaveBeenCalledWith(
    scheduledTaskId("sample-task"),
    { threadId: null },
    expect.any(AbortSignal),
  );
  const order: string[] = [];
  vi.spyOn(upstream.scheduledTasks, "rotateWebhookToken").mockImplementation(async () => {
    order.push("rotate");
    throw new T3ConnectionError("closed", "sample-token");
  });
  const endpoint = vi.spyOn(upstream.scheduledTasks, "webhookEndpoint");
  const failed = await client.callTool({
    name: "rotate_scheduled_task_webhook",
    arguments: { id: "sample-task" },
  });
  expect(order).toEqual(["rotate"]);
  expect(endpoint).not.toHaveBeenCalled();
  expect(failed.isError).toBe(true);
  expect(JSON.stringify(failed)).not.toContain("sample-token");
});

it("preserves per-repository patches in a thread diff", async () => {
  const { client, upstream } = await fixture();
  const data = {
    threadId: threadId("sample-thread"),
    fromTurnCount: 0,
    toTurnCount: 1,
    diff: "",
    repositories: [
      { name: "api", repositoryPath: "/sample/api", relativePath: "api", diff: "sample patch" },
    ],
  };
  vi.spyOn(upstream.threads, "diff").mockResolvedValue(data);
  const result = await client.callTool({
    name: "thread_diff",
    arguments: { threadId: data.threadId },
  });
  expect(result.structuredContent).toEqual(data);
  expect(result.content).toEqual([{ type: "text", text: JSON.stringify(data) }]);
});

it("rejects empty execution changes and invalid diff ranges before acquiring a client", async () => {
  const { client, provider } = await fixture();
  for (const [name, args] of [
    ["configure_scheduled_task", { id: "sample-task", configuration: {} }],
    ["configure_scheduled_task", { id: "sample-task", configuration: { enabled: true } }],
    ["thread_diff", { threadId: "sample-thread", range: { fromTurnCount: 2, toTurnCount: 1 } }],
  ] as const) {
    const result = await client.callTool({ name, arguments: args });
    expect(result.isError).toBe(true);
  }
  expect(provider.get).not.toHaveBeenCalled();
});

it("propagates protocol cancellation to the library operation", async () => {
  const { client, upstream } = await fixture();
  let running!: () => void;
  const started = new Promise<void>((resolve) => {
    running = resolve;
  });
  let operationSignal: AbortSignal | undefined;
  vi.spyOn(upstream.threads, "status").mockImplementation(async (id, signal) => {
    expect(id).toBe(threadId("sample-thread"));
    operationSignal = signal;
    running();
    return new Promise((_resolve, reject) =>
      signal?.addEventListener("abort", () => reject(new Error("cancelled")), { once: true }),
    );
  });
  const abort = new AbortController();
  const pending = client.callTool(
    { name: "thread_status", arguments: { threadId: "sample-thread" } },
    { signal: abort.signal },
  );
  const rejected = expect(pending).rejects.toBeDefined();
  await started;
  abort.abort();
  await rejected;
  await expect.poll(() => operationSignal?.aborted).toBe(true);
});
