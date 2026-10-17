// ---
// relationships:
//   verifies: library-transport
// ---
import { afterEach, beforeEach, describe, expect, expectTypeOf, it } from "vite-plus/test";
import type { TerminalApi } from "../api/terminal.ts";
import type { VcsApi } from "../api/vcs.ts";
import { T3DecodeError } from "../errors.ts";
import { RpcConnection } from "../transport/rpcConnection.ts";
import { SocketTransport } from "../transport/socket.ts";
import { FakeT3Server } from "../../test/support/fakeServer.ts";
import { RpcClient } from "./client.ts";
import { rpcMethods, type RpcMethods } from "./registry.ts";
import type { RpcSuccess } from "./spec.ts";

const cases = [
  [
    "mcpApps.updateModelContext",
    { threadId: "thread-1", itemId: "item-1", conversationThreadId: "thread-1" },
  ],
  ["orchestration.stopWorkflow", { threadId: "thread-1", subagentId: "node-1" }],
  ["terminal.write", { threadId: "thread-1", terminalId: "terminal-1", data: "sample" }],
  ["terminal.resize", { threadId: "thread-1", terminalId: "terminal-1", cols: 80, rows: 24 }],
  ["terminal.close", { threadId: "thread-1" }],
  ["vcs.removeWorktree", { cwd: "/tmp/sample", path: "/tmp/sample-worktree" }],
] as const;

describe("void RPC results", () => {
  let server: FakeT3Server;
  let connection: RpcConnection;
  let client: RpcClient<RpcMethods>;

  beforeEach(async () => {
    server = await FakeT3Server.start();
    connection = new RpcConnection(new SocketTransport({ url: async () => server.wsUrl }));
    client = new RpcClient(connection, rpcMethods);
  });
  afterEach(async () => {
    await connection.close();
    await server.close();
  });

  it.each(cases)("%s decodes stock null success as void", async (method, input) => {
    // Stock 0.1.0 uses Effect's JSON codec: Schema.Void is encoded as null.
    server.respond(method, null);
    const payload = rpcMethods[method].payload.parse(input);
    await expect(client.call(method, payload)).resolves.toBeUndefined();
    expectTypeOf<RpcSuccess<RpcMethods, typeof method>>().toEqualTypeOf<void>();
  });

  it.each(cases)("%s retains omitted success support", async (method, input) => {
    server.respond(method, undefined);
    await expect(
      client.call(method, rpcMethods[method].payload.parse(input)),
    ).resolves.toBeUndefined();
  });

  it.each(cases)("%s rejects malformed success payloads", async (method, input) => {
    for (const raw of [{}, [], false, 0, "sample"]) {
      server.respond(method, raw);
      await expect(
        client.call(method, rpcMethods[method].payload.parse(input)),
      ).rejects.toBeInstanceOf(T3DecodeError);
    }
  });

  it("keeps facade return types void", () => {
    expectTypeOf<ReturnType<VcsApi["removeWorktree"]>>().toEqualTypeOf<Promise<void>>();
    expectTypeOf<ReturnType<TerminalApi["write"]>>().toEqualTypeOf<Promise<void>>();
    expectTypeOf<ReturnType<TerminalApi["resize"]>>().toEqualTypeOf<Promise<void>>();
    expectTypeOf<ReturnType<TerminalApi["close"]>>().toEqualTypeOf<Promise<void>>();
  });
});
