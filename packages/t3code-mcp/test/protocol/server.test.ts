// ---
// relationships:
//   verifies: mcp
// ---
import { Client } from "@modelcontextprotocol/client";
import { InMemoryTransport } from "@modelcontextprotocol/server";
import { T3Client, T3ConnectionError, threadId, scheduledTaskId } from "@wyrd-company/t3code-lib";
import { afterEach, expect, it, vi } from "vite-plus/test";
import { createServer } from "../../src/server.ts";
import { toolNames } from "../../src/tools/index.ts";

const cleanup: (() => Promise<void>)[] = [];
afterEach(async () => {
  for (const close of cleanup.splice(0).toReversed()) await close();
  vi.restoreAllMocks();
});
async function fixture() {
  const upstream = T3Client.create({ baseUrl: "http://127.0.0.1:1" });
  const provider = {
    get: vi.fn().mockResolvedValue(upstream),
    close: vi.fn().mockResolvedValue(undefined),
  };
  const server = createServer(provider);
  const client = new Client({ name: "sample-client", version: "1.0.0" });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await Promise.all([client.connect(clientTransport), server.connect(serverTransport)]);
  cleanup.push(
    () => server.close(),
    () => client.close(),
  );
  return { client, upstream, provider };
}

it("negotiates and advertises only the complementary tool contract with accurate annotations", async () => {
  const { client, provider } = await fixture();
  expect(client.getServerVersion()?.name).toBe("t3code-mcp");
  const { tools } = await client.listTools();
  expect(tools.map((tool) => tool.name)).toEqual(toolNames);
  expect(tools).toHaveLength(16);
  for (const tool of tools) {
    const mutation = [
      "configure_scheduled_task",
      "rotate_scheduled_task_webhook",
      "thread_stop",
      "thread_queue_resume",
      "thread_queue_start",
    ].includes(tool.name);
    expect(tool.annotations).toMatchObject({ readOnlyHint: !mutation, destructiveHint: mutation });
  }
  expect(provider.get).not.toHaveBeenCalled();
});

it("returns matching structured/text values and forwards provider and usage selection", async () => {
  const { client, upstream } = await fixture();
  const status = vi.spyOn(upstream.server, "providerStatus").mockResolvedValue([]);
  const result = await client.callTool({
    name: "provider_status",
    arguments: { instanceId: "sample-provider" },
  });
  expect(status).toHaveBeenCalledWith("sample-provider", expect.any(AbortSignal));
  expect(result.structuredContent).toEqual({ providers: [] });
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
  };
  const failed = await client.callTool({ name: "usage_summary", arguments: input });
  expect(summary).toHaveBeenCalledWith(input, expect.any(AbortSignal));
  expect(failed).toMatchObject({
    isError: true,
    structuredContent: { error: { code: "connection" } },
  });
  expect(JSON.stringify(failed)).not.toContain("sample-sensitive-body");
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
