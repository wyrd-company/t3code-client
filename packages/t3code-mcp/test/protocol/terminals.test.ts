// ---
// relationships:
//   verifies: mcp
// ---
import { T3RpcError } from "@wyrd-company/t3code-lib";
import { afterEach, expect, it, vi } from "vite-plus/test";
import { closeProtocolFixtures, protocolFixture as fixture } from "../support/protocolFixture.ts";

afterEach(closeProtocolFixtures);

const summary = (threadId: string, terminalId: string) => ({
  threadId,
  terminalId,
  cwd: "/sample/project",
  worktreePath: null,
  status: "running" as const,
  pid: 1234,
  exitCode: null,
  exitSignal: null,
  hasRunningSubprocess: true,
  label: "Sample",
  updatedAt: "2026-01-01T00:00:00.000Z",
});

const snapshot = (history: string) => ({
  threadId: "thread-1",
  terminalId: "default",
  cwd: "/sample/project",
  worktreePath: null,
  status: "exited" as const,
  pid: null,
  history,
  exitCode: 1,
  exitSignal: null,
  label: "Sample",
  updatedAt: "2026-01-01T00:00:00.000Z",
});

it("lists only the terminals of the given thread", async () => {
  const { client, upstream } = await fixture();
  const spy = vi
    .spyOn(upstream.terminal, "list")
    .mockResolvedValue([summary("thread-1", "default"), summary("thread-2", "default")]);
  const result = await client.callTool({
    name: "thread_terminals",
    arguments: { threadId: " thread-1 " },
  });
  expect(spy).toHaveBeenCalledWith(expect.any(AbortSignal));
  expect(result.structuredContent).toEqual({ terminals: [summary("thread-1", "default")] });
});

it("returns plain recent output and exit details", async () => {
  const { client, upstream } = await fixture();
  const spy = vi
    .spyOn(upstream.terminal, "read")
    .mockResolvedValue(snapshot("\u001b[31mFAIL\u001b[0m sample\r\n\u001b]0;title\u0007done\n"));
  const result = await client.callTool({
    name: "terminal_output",
    arguments: { threadId: "thread-1", terminalId: "default" },
  });
  expect(spy).toHaveBeenCalledWith(
    { threadId: "thread-1", terminalId: "default" },
    expect.any(AbortSignal),
  );
  expect(result.structuredContent).toMatchObject({
    status: "exited",
    exitCode: 1,
    output: "FAIL sample\ndone\n",
    truncated: false,
  });
  expect(result.structuredContent).not.toHaveProperty("history");
});

it("keeps the last maxChars characters", async () => {
  const { client, upstream } = await fixture();
  vi.spyOn(upstream.terminal, "read").mockResolvedValue(snapshot("first\nsecond\nthird\n"));
  const result = await client.callTool({
    name: "terminal_output",
    arguments: { threadId: "thread-1", terminalId: "default", maxChars: 6 },
  });
  expect(result.structuredContent).toMatchObject({ output: "third\n", truncated: true });
});

it("refuses an unknown terminal with not_found", async () => {
  const { client, upstream } = await fixture();
  vi.spyOn(upstream.terminal, "read").mockRejectedValue(
    new T3RpcError("terminal.observe", {
      _tag: "TerminalSessionLookupError",
      threadId: "thread-1",
      terminalId: "sample-private",
    }),
  );
  const result = await client.callTool({
    name: "terminal_output",
    arguments: { threadId: "thread-1", terminalId: "absent" },
  });
  expect(result).toMatchObject({
    isError: true,
    structuredContent: { error: { code: "not_found" } },
  });
  expect(JSON.stringify(result)).not.toContain("sample-private");
});

it.each([
  ["thread_terminals", {}],
  ["thread_terminals", { threadId: "thread-1", extra: true }],
  ["terminal_output", { threadId: "thread-1" }],
  ["terminal_output", { threadId: "thread-1", terminalId: " " }],
  ["terminal_output", { threadId: "thread-1", terminalId: "default", maxChars: 0 }],
  ["terminal_output", { threadId: "thread-1", terminalId: "default", maxChars: 64_001 }],
])("%s validates %j before acquiring a client", async (name, args) => {
  const { client, provider } = await fixture();
  const result = await client.callTool({ name, arguments: args });
  expect(result.isError).toBe(true);
  expect(provider.get).not.toHaveBeenCalled();
});
