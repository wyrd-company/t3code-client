// ---
// relationships:
//   verifies: mcp
// ---
import { afterEach, expect, it, vi } from "vite-plus/test";
import { Client } from "@modelcontextprotocol/client";
import { InMemoryTransport } from "@modelcontextprotocol/server";
import { harness, projection } from "../test/support/fakes.ts";
import { createServer, SERVER_VERSION } from "./server.ts";
const closers: (() => Promise<void>)[] = [];
afterEach(async () => {
  vi.useRealTimers();
  await Promise.all(closers.splice(0).map((close) => close()));
});
async function connected(state = projection()) {
  const h = harness({}, state);
  const server = createServer(h.registry);
  const client = new Client({ name: "sample-client", version: "0.0.0" });
  const [clientWire, serverWire] = InMemoryTransport.createLinkedPair();
  await server.connect(serverWire);
  await client.connect(clientWire);
  closers.push(() => client.close());
  closers.push(() => server.close());
  return { ...h, server, client };
}
it("publishes the manifest version and closes lazy clients with the MCP session", async () => {
  const h = await connected();
  expect(h.client.getServerVersion()?.version).toBe(SERVER_VERSION);
  await h.client.callTool({ name: "server_capabilities" });
  await h.client.close();
  await vi.waitFor(() => expect(h.close).toHaveBeenCalledTimes(1));
});
it("normalizes tool failures into matching structured and text error results", async () => {
  const h = await connected();
  h.threads.detail.mockRejectedValue(new Error("sample-private-value"));
  const result = await h.client.callTool({
    name: "thread_read",
    arguments: { threadId: "thread-1" },
  });
  expect(result.isError).toBe(true);
  expect(result.structuredContent).toEqual({
    error: { code: "upstream_error", message: "The upstream operation failed." },
  });
  expect(JSON.stringify(result)).not.toContain("sample-private-value");
  expect(JSON.parse((result.content as { text: string }[])[0]!.text)).toEqual(
    result.structuredContent,
  );
});
it("delivers requested progress through the SDK and returns a timeout without interrupting", async () => {
  const h = await connected(projection("running"));
  vi.useFakeTimers();
  const onprogress = vi.fn();
  const result = h.client.callTool(
    { name: "thread_wait", arguments: { threads: [{ threadId: "thread-1" }], timeoutMs: 31_000 } },
    { onprogress },
  );
  await vi.advanceTimersByTimeAsync(15_001);
  expect(onprogress).toHaveBeenCalledWith(expect.objectContaining({ progress: 15 }));
  await vi.advanceTimersByTimeAsync(16_000);
  expect((await result).structuredContent).toMatchObject({ timedOut: true });
  expect(h.threads.interrupt).not.toHaveBeenCalled();
});
it("propagates SDK request cancellation to upstream watches", async () => {
  const h = await connected(projection("running"));
  const controller = new AbortController();
  const pending = h.client.callTool(
    { name: "thread_wait", arguments: { threads: [{ threadId: "thread-1" }], timeoutMs: 600_000 } },
    { signal: controller.signal },
  );
  const cancelled = expect(pending).rejects.toThrow();
  await vi.waitFor(() => expect(h.threads.watch).toHaveBeenCalled());
  controller.abort(new Error("sample cancellation"));
  await cancelled;
  await vi.waitFor(() => expect(h.threads.watch.mock.calls[0]![1].signal.aborted).toBe(true));
});
