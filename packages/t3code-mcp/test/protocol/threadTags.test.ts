// ---
// relationships:
//   verifies: mcp
// ---
import { T3RpcError } from "@wyrd-company/t3code-lib";
import { afterEach, expect, it, vi } from "vite-plus/test";
import { closeProtocolFixtures, protocolFixture as fixture } from "../support/protocolFixture.ts";

afterEach(closeProtocolFixtures);

const shell = (id: string, extra: Record<string, unknown> = {}) => ({
  id,
  title: `Sample ${id}`,
  projectId: "project-1",
  status: "idle",
  archivedAt: null,
  tags: ["alpha"],
  ...extra,
});

it("sets a trimmed tag with the signal and returns the tags after the change", async () => {
  const { client, upstream } = await fixture();
  const spy = vi.spyOn(upstream.threads, "setTag").mockResolvedValue(["alpha", "beta"]);
  const result = await client.callTool({
    name: "thread_tag",
    arguments: { threadId: " thread-1 ", tag: " beta ", tagged: true },
  });
  expect(spy).toHaveBeenCalledWith("thread-1", "beta", true, expect.any(AbortSignal));
  expect(result.isError).toBeUndefined();
  expect(result.structuredContent).toEqual({ threadId: "thread-1", tags: ["alpha", "beta"] });
});

it("lists tagged threads as bounded summaries", async () => {
  const { client, upstream } = await fixture();
  const threads = [
    shell("thread-1", { tags: undefined }),
    shell("thread-2", { archivedAt: "2026-01-01T00:00:00.000Z" }),
    shell("thread-3"),
  ];
  const spy = vi
    .spyOn(upstream.threads, "list")
    .mockResolvedValue(threads as unknown as Awaited<ReturnType<typeof upstream.threads.list>>);
  const result = await client.callTool({
    name: "tagged_threads",
    arguments: { tag: " alpha ", includeArchived: true, limit: 2 },
  });
  expect(spy).toHaveBeenCalledWith(
    { tag: "alpha", includeArchived: true },
    expect.any(AbortSignal),
  );
  expect(result.structuredContent).toEqual({
    threads: [
      {
        threadId: "thread-1",
        title: "Sample thread-1",
        projectId: "project-1",
        status: "idle",
        archived: false,
        tags: [],
      },
      {
        threadId: "thread-2",
        title: "Sample thread-2",
        projectId: "project-1",
        status: "idle",
        archived: true,
        tags: ["alpha"],
      },
    ],
    total: 3,
    truncated: true,
  });
  await client.callTool({ name: "tagged_threads", arguments: { tag: "alpha" } });
  expect(spy).toHaveBeenLastCalledWith({ tag: "alpha" }, expect.any(AbortSignal));
});

it("keeps tag failures safe", async () => {
  const { client, upstream } = await fixture();
  vi.spyOn(upstream.threads, "setTag").mockRejectedValue(
    new T3RpcError("orchestration.dispatchCommand", {
      _tag: "OrchestrationV2DispatchCommandError",
      message: "sample-private",
    }),
  );
  const result = await client.callTool({
    name: "thread_tag",
    arguments: { threadId: "thread-1", tag: "alpha", tagged: false },
  });
  expect(result).toMatchObject({
    isError: true,
    structuredContent: { error: { code: "rpc_failed" } },
  });
  expect(JSON.stringify(result)).not.toContain("sample-private");
});

it.each([
  ["thread_tag", { threadId: "thread-1", tag: "alpha" }],
  ["thread_tag", { threadId: "thread-1", tag: " ", tagged: true }],
  ["thread_tag", { threadId: "thread-1", tag: "a".repeat(65), tagged: true }],
  ["thread_tag", { threadId: "thread-1", tag: "two\nlines", tagged: true }],
  ["thread_tag", { threadId: " ", tag: "alpha", tagged: true }],
  ["tagged_threads", {}],
  ["tagged_threads", { tag: "alpha", limit: 0 }],
  ["tagged_threads", { tag: "alpha", limit: 501 }],
  ["tagged_threads", { tag: "alpha", extra: true }],
])("%s validates %j before acquiring a client", async (name, args) => {
  const { client, provider } = await fixture();
  const result = await client.callTool({ name, arguments: args });
  expect(result.isError).toBe(true);
  expect(provider.get).not.toHaveBeenCalled();
});
