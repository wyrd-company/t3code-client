// ---
// relationships:
//   verifies: mcp
// ---
import { Client } from "@modelcontextprotocol/client";
import { InMemoryTransport } from "@modelcontextprotocol/server";
import { T3Client, T3RpcError } from "@wyrd-company/t3code-lib";
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
const controls = [
  {
    name: "thread_stop",
    method: "stopThread",
    args: { threadId: " thread-1 " },
    call: ["thread-1", {}],
    data: { threadId: "thread-1" },
  },
  {
    name: "thread_queue_resume",
    method: "resumeQueue",
    args: { threadId: " thread-1 " },
    call: ["thread-1"],
    data: { threadId: "thread-1" },
  },
  {
    name: "thread_queue_start",
    method: "startQueuedRun",
    args: { threadId: " thread-1 ", runId: " run-1 " },
    call: ["thread-1", "run-1"],
    data: { threadId: "thread-1", runId: "run-1" },
  },
] as const;
it.each(controls)(
  "returns only acknowledgement ids for $name and forwards the signal",
  async ({ name, method, args, call, data }) => {
    const { client, upstream } = await fixture();
    const spy = vi.spyOn(upstream.threads, method).mockResolvedValue();
    const result = await client.callTool({ name, arguments: args });
    expect(spy).toHaveBeenCalledWith(...call, expect.any(AbortSignal));
    expect(result.isError).toBeUndefined();
    expect(result.structuredContent).toEqual(data);
    expect(result.content).toEqual([{ type: "text", text: JSON.stringify(data) }]);
  },
);
it.each(["", " padded "])("preserves the Stop reason %j", async (reason) => {
  const { client, upstream } = await fixture();
  const spy = vi.spyOn(upstream.threads, "stopThread").mockResolvedValue();
  await client.callTool({ name: "thread_stop", arguments: { threadId: "thread-1", reason } });
  expect(spy).toHaveBeenCalledWith("thread-1", { reason }, expect.any(AbortSignal));
});
it.each([
  ["thread_stop", {}],
  ["thread_stop", { threadId: " " }],
  ["thread_stop", { threadId: "thread-1", reason: null }],
  ["thread_queue_resume", { threadId: " " }],
  ["thread_queue_start", { threadId: "thread-1" }],
  ["thread_queue_start", { threadId: "thread-1", runId: " " }],
  ["thread_queue_start", { threadId: " ", runId: "run-1" }],
])("validates %s before acquiring a client", async (name, args) => {
  const { client, provider } = await fixture();
  expect(
    (await client.callTool({ name: name as string, arguments: args as Record<string, unknown> }))
      .isError,
  ).toBe(true);
  expect(provider.get).not.toHaveBeenCalled();
});
it.each(controls)("keeps $name RPC failures safe", async ({ name, method, args }) => {
  const { client, upstream } = await fixture();
  vi.spyOn(upstream.threads, method).mockRejectedValue(
    new T3RpcError("orchestration.dispatchCommand", {
      _tag: "OrchestrationV2DispatchCommandError",
      commandId: "command-1",
      commandType: "queued-run.start",
      message: "sample-private",
    }),
  );
  const result = await client.callTool({ name, arguments: args });
  expect(result).toMatchObject({
    isError: true,
    structuredContent: { error: { code: "rpc_failed" } },
  });
  expect(JSON.stringify(result)).not.toContain("sample-private");
});
it.each(controls)("cancels $name at the library boundary", async ({ name, method, args }) => {
  const { client, upstream } = await fixture();
  let observed: AbortSignal | undefined;
  let running!: () => void;
  const started = new Promise<void>((resolve) => {
    running = resolve;
  });
  const operation = (_id: unknown, ...rest: unknown[]) => {
    observed = rest.at(-1) as AbortSignal;
    running();
    return new Promise<void>((_resolve, reject) =>
      observed!.addEventListener("abort", () => reject(new Error("cancelled")), { once: true }),
    );
  };
  vi.spyOn(upstream.threads, method).mockImplementation(operation);
  const abort = new AbortController();
  const pending = client.callTool({ name, arguments: args }, { signal: abort.signal });
  const rejected = expect(pending).rejects.toBeDefined();
  await started;
  abort.abort();
  await rejected;
  await expect.poll(() => observed?.aborted).toBe(true);
});
