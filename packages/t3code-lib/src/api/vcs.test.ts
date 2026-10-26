// ---
// relationships:
//   verifies: library
// ---
import { afterEach, beforeEach, describe, expect, it } from "vite-plus/test";

import { FakeT3Server } from "../../test/support/fakeServer.ts";
import { RpcClient } from "../rpc/client.ts";
import { T3PreconditionError } from "../errors.ts";
import { rpcMethods } from "../rpc/registry.ts";
import { RpcConnection } from "../transport/rpcConnection.ts";
import { SocketTransport } from "../transport/socket.ts";
import { VcsApi } from "./vcs.ts";

const localStatus = {
  isRepo: true,
  hasPrimaryRemote: true,
  isDefaultRef: false,
  refName: "sample-ref",
  hasWorkingTreeChanges: false,
  workingTree: {
    files: [{ path: " sample file.txt ", insertions: 1, deletions: 0 }],
    insertions: 1,
    deletions: 0,
  },
};

describe("VcsApi", () => {
  let server: FakeT3Server;
  let connection: RpcConnection;
  let api: VcsApi;

  beforeEach(async () => {
    server = await FakeT3Server.start();
    connection = new RpcConnection(new SocketTransport({ url: async () => server.wsUrl }));
    api = new VcsApi(new RpcClient(connection, rpcMethods));
  });

  afterEach(async () => {
    await connection.close();
    await server.close();
  });

  it("creates a ref through the registered RPC method", async () => {
    server.respond("vcs.createRef", { refName: "sample-ref" });

    await expect(api.createRef({ cwd: "/tmp/sample", refName: "sample-ref" })).resolves.toEqual({
      refName: "sample-ref",
    });
  });

  it("sends the required null path and returns the server-selected worktree", async () => {
    const input = { cwd: "/tmp/sample", refName: "main", newRefName: "feature/sample", path: null };
    const result = { worktree: { path: "/tmp/managed/sample", refName: "feature/sample" } };
    let received: unknown;
    server.handle("vcs.createWorktree", (payload) => {
      received = payload;
      return { kind: "value", value: result };
    });

    await expect(api.createWorktree(input)).resolves.toEqual(result);
    expect(received).toEqual(input);
  });

  it("rejects a custom worktree path before opening a connection", async () => {
    const input = { cwd: "/tmp/sample", refName: "main", path: "/tmp/custom" };
    // @ts-expect-error The public RPC contract permits only a null path.
    await expect(api.createWorktree(input)).rejects.toBeInstanceOf(T3PreconditionError);
    expect(server.connections).toHaveLength(0);
  });

  it("rejects an omitted worktree path before opening a connection", async () => {
    await expect(
      // @ts-expect-error The null path key is required by the wire contract.
      api.createWorktree({ cwd: "/tmp/sample", refName: "main" }),
    ).rejects.toBeInstanceOf(T3PreconditionError);
    expect(server.connections).toHaveLength(0);
  });

  it("unwraps status events and preserves decode errors from separate chunks", async () => {
    server.handle("subscribeVcsStatus", () => ({
      kind: "stream",
      chunks: [
        [{ _tag: "snapshot", local: localStatus, remote: null }],
        [{ _tag: "localUpdated", local: { isRepo: true } }],
      ],
    }));

    const items = [];
    for await (const item of api.watchStatus({ cwd: "/tmp/sample" })) items.push(item);

    expect(items[0]).toMatchObject({
      _tag: "snapshot",
      local: { refName: "sample-ref", workingTree: { files: [{ path: " sample file.txt " }] } },
    });
    expect(items[1]).toMatchObject({ kind: "decode-error" });
  });
});
