import { afterEach, beforeEach, describe, expect, it } from "vite-plus/test";

import { T3ConnectionError, T3RpcError } from "../errors.ts";
import { FakeT3Server } from "../../test/support/fakeServer.ts";
import { RpcClient } from "../rpc/client.ts";
import { rpcMethods } from "../rpc/registry.ts";
import { RpcConnection } from "../transport/rpcConnection.ts";
import { SocketTransport } from "../transport/socket.ts";
import { TerminalApi } from "./terminal.ts";

const snapshot = {
  threadId: "record-1",
  terminalId: "terminal-1",
  cwd: "/tmp/sample",
  worktreePath: null,
  status: "running",
  pid: 1234,
  history: "",
  exitCode: null,
  exitSignal: null,
  label: "Sample terminal",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

describe("TerminalApi", () => {
  let server: FakeT3Server;
  let connection: RpcConnection;
  let api: TerminalApi;

  beforeEach(async () => {
    server = await FakeT3Server.start();
    connection = new RpcConnection(new SocketTransport({ url: async () => server.wsUrl }));
    api = new TerminalApi(new RpcClient(connection, rpcMethods));
  });

  afterEach(async () => {
    await connection.close();
    await server.close();
  });

  it("opens a terminal through the registered RPC method", async () => {
    server.respond("terminal.open", snapshot);

    await expect(
      api.open({ threadId: "record-1", terminalId: "terminal-1", cwd: "/tmp/sample" }),
    ).resolves.toMatchObject({ terminalId: "terminal-1", status: "running" });
  });

  it("reads one terminal from the first observe snapshot", async () => {
    let payload: unknown;
    server.handle("terminal.observe", (input) => {
      payload = input;
      return {
        kind: "stream",
        chunks: [
          [{ type: "snapshot", snapshot: { ...snapshot, history: "sample output\n" } }],
          [{ type: "output", threadId: "record-1", terminalId: "terminal-1", data: "more" }],
        ],
      };
    });

    await expect(api.read({ threadId: "record-1", terminalId: "terminal-1" })).resolves.toEqual({
      ...snapshot,
      history: "sample output\n",
    });
    expect(payload).toEqual({ threadId: "record-1", terminalId: "terminal-1" });
  });

  it("fails a read of an unknown terminal with the lookup error", async () => {
    server.handle("terminal.observe", () => ({
      kind: "fail",
      error: { _tag: "TerminalSessionLookupError", threadId: "record-1", terminalId: "absent" },
    }));

    const error = await api.read({ threadId: "record-1", terminalId: "absent" }).catch((e) => e);
    expect(error).toBeInstanceOf(T3RpcError);
    expect((error as T3RpcError).is("TerminalSessionLookupError")).toBe(true);
  });

  it("fails a read whose stream does not start with a snapshot", async () => {
    server.handle("terminal.observe", () => ({
      kind: "stream",
      chunks: [[{ type: "closed", threadId: "record-1", terminalId: "terminal-1" }]],
    }));

    await expect(
      api.read({ threadId: "record-1", terminalId: "terminal-1" }),
    ).rejects.toBeInstanceOf(T3ConnectionError);
  });

  it("lists terminals from the first metadata snapshot", async () => {
    const summary = {
      threadId: "record-1",
      terminalId: "terminal-1",
      cwd: "/tmp/sample",
      worktreePath: null,
      status: "running",
      pid: 1234,
      exitCode: null,
      exitSignal: null,
      hasRunningSubprocess: false,
      label: "Sample terminal",
      updatedAt: "2026-01-01T00:00:00.000Z",
    };
    server.handle("subscribeTerminalMetadata", () => ({
      kind: "stream",
      chunks: [
        [{ type: "snapshot", terminals: [summary] }],
        [{ type: "upsert", terminal: summary }],
      ],
    }));

    await expect(api.list()).resolves.toEqual([summary]);
  });

  it("fails a list whose stream ends empty", async () => {
    server.handle("subscribeTerminalMetadata", () => ({ kind: "stream", chunks: [] }));

    await expect(api.list()).rejects.toBeInstanceOf(T3ConnectionError);
  });
});
