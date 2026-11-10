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

it("reads a thread family with the signal and returns the library result", async () => {
  const { client, upstream } = await fixture();
  const family = { snapshotSequence: 7, threads: [] };
  const spy = vi.spyOn(upstream.shell, "threadFamily").mockResolvedValue(family);
  const result = await client.callTool({
    name: "thread_family",
    arguments: { threadId: " thread-1 " },
  });
  expect(spy).toHaveBeenCalledWith("thread-1", expect.any(AbortSignal));
  expect(result.isError).toBeUndefined();
  expect(result.structuredContent).toEqual(family);
  expect(result.content).toEqual([{ type: "text", text: JSON.stringify(family) }]);
});

it("lists the threads on a trimmed worktree path", async () => {
  const { client, upstream } = await fixture();
  const ids = [threadId("thread-1"), threadId("thread-2")];
  const spy = vi.spyOn(upstream.shell, "worktreeThreadIds").mockResolvedValue(ids);
  const result = await client.callTool({
    name: "worktree_threads",
    arguments: { worktreePath: " /sample/worktree " },
  });
  expect(spy).toHaveBeenCalledWith("/sample/worktree", expect.any(AbortSignal));
  expect(result.structuredContent).toEqual({ threadIds: ids });
});

it("keeps read failures safe", async () => {
  const { client, upstream } = await fixture();
  vi.spyOn(upstream.shell, "worktreeThreadIds").mockRejectedValue(
    new T3RpcError("orchestration.getWorktreeThreadIds", {
      _tag: "OrchestrationV2GetShellSnapshotError",
      message: "sample-private",
    }),
  );
  const result = await client.callTool({
    name: "worktree_threads",
    arguments: { worktreePath: "/sample/worktree" },
  });
  expect(result).toMatchObject({
    isError: true,
    structuredContent: { error: { code: "rpc_failed" } },
  });
  expect(JSON.stringify(result)).not.toContain("sample-private");
});

it.each([
  ["thread_family", {}],
  ["thread_family", { threadId: " " }],
  ["thread_family", { threadId: "thread-1", extra: true }],
  ["worktree_threads", {}],
  ["worktree_threads", { worktreePath: " " }],
  ["worktree_threads", { worktreePath: null }],
])("%s validates %j before acquiring a client", async (name, args) => {
  const { client, provider } = await fixture();
  const result = await client.callTool({ name, arguments: args });
  expect(result.isError).toBe(true);
  expect(provider.get).not.toHaveBeenCalled();
});
