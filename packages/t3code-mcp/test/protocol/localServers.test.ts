// ---
// relationships:
//   verifies: mcp
// ---
import { T3RpcError, threadId } from "@wyrd-company/t3code-lib";
import { afterEach, expect, it, vi } from "vite-plus/test";
import { closeProtocolFixtures, protocolFixture as fixture } from "../support/protocolFixture.ts";

afterEach(closeProtocolFixtures);

const listener = (port: number, owner: { terminal?: string; agent?: string } = {}) => ({
  host: "127.0.0.1",
  port,
  url: `http://127.0.0.1:${port}/`,
  processName: "node",
  pid: 1000 + port,
  terminal:
    owner.terminal === undefined
      ? null
      : { threadId: threadId(owner.terminal), terminalId: "default" },
  agent: owner.agent === undefined ? null : { threadId: threadId(owner.agent) },
});

const scan = (...servers: ReturnType<typeof listener>[]) => ({
  servers,
  scannedAt: "2026-01-01T00:00:00.000Z",
});

it("lists every listener, or only those a thread owns", async () => {
  const { client, upstream } = await fixture();
  const spy = vi.spyOn(upstream.localServers, "list").mockResolvedValue(
    scan(listener(3000, { agent: "thread-1" }), listener(3001, { terminal: "thread-1" }), {
      ...listener(3002),
      processName: "x".repeat(600),
    }),
  );

  const all = await client.callTool({ name: "local_servers", arguments: {} });
  expect(spy).toHaveBeenCalledWith({}, expect.any(AbortSignal));
  const servers = (all.structuredContent as { servers: { processName: string }[] }).servers;
  expect(servers).toHaveLength(3);
  expect(servers[2]?.processName).toHaveLength(500);

  const owned = await client.callTool({
    name: "local_servers",
    arguments: { threadId: "thread-1" },
  });
  expect(owned.structuredContent).toEqual({
    scannedAt: "2026-01-01T00:00:00.000Z",
    servers: [listener(3000, { agent: "thread-1" }), listener(3001, { terminal: "thread-1" })],
  });
});

it("stops a listener that the thread's agent started", async () => {
  const { client, upstream } = await fixture();
  vi.spyOn(upstream.localServers, "list").mockResolvedValue(
    scan(listener(3000, { agent: "thread-1" })),
  );
  const stop = vi.spyOn(upstream.localServers, "stop").mockResolvedValue(undefined);

  const result = await client.callTool({
    name: "stop_local_server",
    arguments: { threadId: "thread-1", pid: 4000, port: 3000 },
  });
  expect(stop).toHaveBeenCalledWith({ pid: 4000, port: 3000 }, expect.any(AbortSignal));
  expect(result.structuredContent).toEqual({
    threadId: "thread-1",
    pid: 4000,
    port: 3000,
    stopped: true,
  });
});

it.each([
  ["not_found", { threadId: "thread-1", pid: 4000, port: 3999 }],
  ["terminal_owned", { threadId: "thread-1", pid: 4001, port: 3001 }],
  ["not_owned", { threadId: "thread-1", pid: 4002, port: 3002 }],
  ["not_owned", { threadId: "thread-1", pid: 4003, port: 3003 }],
])("refuses with %s before it signals", async (code, args) => {
  const { client, upstream } = await fixture();
  vi.spyOn(upstream.localServers, "list").mockResolvedValue(
    scan(
      listener(3000, { agent: "thread-1" }),
      listener(3001, { terminal: "thread-1" }),
      listener(3002, { agent: "thread-2" }),
      listener(3003),
    ),
  );
  const stop = vi.spyOn(upstream.localServers, "stop");

  const result = await client.callTool({ name: "stop_local_server", arguments: args });
  expect(result.isError).toBe(true);
  expect(result.structuredContent).toMatchObject({ error: { code } });
  expect(stop).not.toHaveBeenCalled();
});

it.each([
  ["not-found", "not_found"],
  ["shared-group", "shared_group"],
  ["unsupported", "unsupported"],
  ["signal-failed", "rpc_failed"],
])("maps the server reason %s to %s", async (reason, code) => {
  const { client, upstream } = await fixture();
  vi.spyOn(upstream.localServers, "list").mockResolvedValue(
    scan(listener(3000, { agent: "thread-1" })),
  );
  vi.spyOn(upstream.localServers, "stop").mockRejectedValue(
    new T3RpcError("preview.stopLocalServer", {
      _tag: "PreviewStopLocalServerError",
      reason,
      cause: "sample cause",
    }),
  );

  const result = await client.callTool({
    name: "stop_local_server",
    arguments: { threadId: "thread-1", pid: 4000, port: 3000 },
  });
  expect(result.isError).toBe(true);
  expect(result.structuredContent).toMatchObject({ error: { code } });
  expect(JSON.stringify(result.structuredContent)).not.toContain("sample cause");
});

it.each([
  ["local_servers", { extra: true }],
  ["stop_local_server", { threadId: "thread-1", pid: 0, port: 3000 }],
  ["stop_local_server", { threadId: "thread-1", pid: 1, port: 70_000 }],
  ["stop_local_server", { pid: 1, port: 3000 }],
])("rejects invalid %s arguments", async (name, args) => {
  const { client } = await fixture();
  const result = await client.callTool({ name, arguments: args });
  expect(result.isError).toBe(true);
});

it("probes the given urls as configured URLs", async () => {
  const { client, upstream } = await fixture();
  const spy = vi.spyOn(upstream.localServers, "list").mockResolvedValue(scan(listener(3000)));
  const result = await client.callTool({
    name: "local_servers",
    arguments: { urls: ["http://127.0.0.1:3000/"] },
  });
  expect(spy).toHaveBeenCalledWith(
    { configuredUrls: ["http://127.0.0.1:3000/"] },
    expect.any(AbortSignal),
  );
  expect(result.structuredContent).toMatchObject({ servers: [{ agent: null, terminal: null }] });
});
