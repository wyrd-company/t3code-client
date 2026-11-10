// ---
// relationships:
//   verifies: mcp
// ---
import { Client } from "@modelcontextprotocol/client";
import { InMemoryTransport } from "@modelcontextprotocol/server";
import { T3Client, T3RpcError, threadId } from "@wyrd-company/t3code-lib";
import { afterEach, expect, it, vi } from "vite-plus/test";
import { createServer } from "../../src/server.ts";

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
  const [a, b] = InMemoryTransport.createLinkedPair();
  await Promise.all([client.connect(a), server.connect(b)]);
  cleanup.push(
    () => server.close(),
    () => client.close(),
  );
  return { client, upstream, provider };
}
const forceStopError = (fields: Record<string, unknown>) =>
  new T3RpcError("orchestration.forceStopThread", {
    _tag: "OrchestrationV2ForceStopThreadError",
    threadId: "thread-1",
    ...fields,
  });

it.each([
  [{ threadId: " thread-1 " }, ["thread-1", {}]],
  [{ threadId: "thread-1", runId: " run-1 " }, ["thread-1", { runId: "run-1" }]],
])("forwards %j with the signal and returns the outcome", async (args, call) => {
  const { client, upstream } = await fixture();
  const data = { outcome: "shared", sharedWithThreadIds: [threadId("thread-2")] };
  const spy = vi.spyOn(upstream.threads, "forceStop").mockResolvedValue(data);
  const result = await client.callTool({ name: "thread_force_stop", arguments: args });
  expect(spy).toHaveBeenCalledWith(...call, expect.any(AbortSignal));
  expect(result.isError).toBeUndefined();
  expect(result.structuredContent).toEqual(data);
  expect(result.content).toEqual([{ type: "text", text: JSON.stringify(data) }]);
});

it("reports a superseded run with a stable code", async () => {
  const { client, upstream } = await fixture();
  vi.spyOn(upstream.threads, "forceStop").mockRejectedValue(
    forceStopError({ reason: "superseded" }),
  );
  const result = await client.callTool({
    name: "thread_force_stop",
    arguments: { threadId: "thread-1", runId: "run-1" },
  });
  expect(result).toMatchObject({
    isError: true,
    structuredContent: {
      error: { code: "superseded", message: "Another run is the latest; nothing was stopped." },
    },
  });
});

it("keeps other force stop failures safe", async () => {
  const { client, upstream } = await fixture();
  vi.spyOn(upstream.threads, "forceStop").mockRejectedValue(
    forceStopError({ cause: { message: "sample-private" } }),
  );
  const result = await client.callTool({
    name: "thread_force_stop",
    arguments: { threadId: "thread-1" },
  });
  expect(result).toMatchObject({
    isError: true,
    structuredContent: { error: { code: "rpc_failed" } },
  });
  expect(JSON.stringify(result)).not.toContain("sample-private");
});

it.each([
  {},
  { threadId: " " },
  { threadId: "thread-1", runId: " " },
  { threadId: "thread-1", runId: null },
])("validates %j before acquiring a client", async (args) => {
  const { client, provider } = await fixture();
  const result = await client.callTool({ name: "thread_force_stop", arguments: args });
  expect(result.isError).toBe(true);
  expect(provider.get).not.toHaveBeenCalled();
});

it("cancels at the library boundary", async () => {
  const { client, upstream } = await fixture();
  let observed: AbortSignal | undefined;
  let running!: () => void;
  const started = new Promise<void>((resolve) => {
    running = resolve;
  });
  vi.spyOn(upstream.threads, "forceStop").mockImplementation((_id, _options, signal) => {
    observed = signal;
    running();
    return new Promise((_resolve, reject) =>
      signal!.addEventListener("abort", () => reject(new Error("cancelled")), { once: true }),
    );
  });
  const abort = new AbortController();
  const pending = client.callTool(
    { name: "thread_force_stop", arguments: { threadId: "thread-1" } },
    { signal: abort.signal },
  );
  const rejected = expect(pending).rejects.toBeDefined();
  await started;
  abort.abort();
  await rejected;
  await expect.poll(() => observed?.aborted).toBe(true);
});
