// ---
// relationships:
//   verifies: library-facades
// ---
import { afterEach, beforeEach, describe, expect, it } from "vite-plus/test";

import { FakeT3Server } from "../../test/support/fakeServer.ts";
import { T3RpcError } from "../errors.ts";
import { RpcClient } from "../rpc/client.ts";
import { rpcMethods } from "../rpc/registry.ts";
import { isRpcErrorOfTag } from "../schemas/rpcErrors.ts";
import { HttpTransport } from "../transport/http.ts";
import { RpcConnection } from "../transport/rpcConnection.ts";
import { SocketTransport } from "../transport/socket.ts";
import { ServerApi } from "./server.ts";
import { VcsApi } from "./vcs.ts";

const client = { label: "Sample client", surface: "cli", deviceType: "bot" } as const;

describe("server release, triage and on-demand inputs", () => {
  let server: FakeT3Server;
  let connection: RpcConnection;
  let api: ServerApi;

  beforeEach(async () => {
    server = await FakeT3Server.start();
    connection = new RpcConnection(new SocketTransport({ url: async () => server.wsUrl }));
    api = new ServerApi(
      new RpcClient(connection, rpcMethods),
      new HttpTransport({ baseUrl: server.httpUrl, getAccessToken: async () => undefined }),
    );
  });

  afterEach(async () => {
    await connection.close();
    await server.close();
  });

  it("reads a release, its migration and a missing release", async () => {
    const received: unknown[] = [];
    const replies = [{ version: "1.2.3", databaseMigration: 7, future: "kept" }, null];
    server.handle("server.getNpmRelease", (payload) => {
      received.push(payload);
      return { kind: "value", value: replies[received.length - 1] };
    });
    await expect(api.getNpmRelease({ spec: "1.2.3" })).resolves.toEqual(replies[0]);
    await expect(api.getNpmRelease({ spec: "nightly" })).resolves.toBeNull();
    expect(received).toEqual([{ spec: "1.2.3" }, { spec: "nightly" }]);
  });

  it("rejects a spec that the contract does not allow", () => {
    const { payload } = rpcMethods["server.getNpmRelease"];
    for (const spec of ["latest", "nightly", "1.2.3", "1.2.3-nightly.20260101.1"]) {
      expect(payload.safeParse({ spec }).success).toBe(true);
    }
    for (const spec of ["", "next", "1.2", "1.2.3 ", `1.2.3-${"a".repeat(64)}`]) {
      expect(payload.safeParse({ spec }).success).toBe(false);
    }
  });

  it("surfaces the lookup failure as a typed record", async () => {
    server.handle("server.getNpmRelease", () => ({
      kind: "fail",
      error: { _tag: "ServerNpmReleaseError", reason: "npm could not complete the lookup." },
    }));
    const failure: unknown = await api.getNpmRelease({ spec: "latest" }).catch((e: unknown) => e);
    expect(failure).toBeInstanceOf(T3RpcError);
    const { record } = failure as T3RpcError;
    expect(isRpcErrorOfTag(record, "ServerNpmReleaseError") && record.reason).toBe(
      "npm could not complete the lookup.",
    );
  });

  it("sends the client and returns the triage prompt", async () => {
    let received: unknown;
    server.handle("server.prepareTriage", (payload) => {
      received = payload;
      return { kind: "value", value: { prompt: "Sample prompt", future: "kept" } };
    });
    await expect(api.prepareTriage({ client })).resolves.toEqual({
      prompt: "Sample prompt",
      future: "kept",
    });
    expect(received).toEqual({ client });
  });

  it("surfaces the triage failure as a typed record", async () => {
    server.handle("server.prepareTriage", () => ({
      kind: "fail",
      error: { _tag: "ServerPrepareTriageError" },
    }));
    const failure: unknown = await api.prepareTriage({ client }).catch((e: unknown) => e);
    expect(failure).toBeInstanceOf(T3RpcError);
    expect(isRpcErrorOfTag((failure as T3RpcError).record, "ServerPrepareTriageError")).toBe(true);
  });

  it("validates the presentation metadata against the contract", () => {
    const { payload } = rpcMethods["server.prepareTriage"];
    expect(payload.safeParse({ client: {} }).success).toBe(true);
    expect(payload.safeParse({}).success).toBe(false);
    expect(payload.safeParse({ client: { surface: "watch" } }).success).toBe(false);
    expect(payload.safeParse({ client: { webDeployment: "other" } }).success).toBe(false);
    expect(payload.safeParse({ client: { osMajorVersion: 1.5 } }).success).toBe(false);
    expect(payload.safeParse({ client: { label: "  " } }).success).toBe(false);
  });

  it("sends the on-demand flags of the configuration stream only when set", async () => {
    const received: unknown[] = [];
    server.handle("subscribeServerConfig", (payload) => {
      received.push(payload);
      return { kind: "stream", chunks: [] };
    });
    const drain = async (stream: AsyncIterable<unknown>) => {
      for await (const _ of stream);
    };
    await drain(api.watchConfig());
    await drain(api.watchConfig({ workspaceSnapshotsOnDemand: true, usageLimitsCommand: false }));
    await drain(
      api.watchConfig({ workspaceSnapshotsOnDemand: true, providerCatalogsOnDemand: true }),
    );
    expect(received).toEqual([
      {},
      { workspaceSnapshotsOnDemand: true, usageLimitsCommand: false },
      { workspaceSnapshotsOnDemand: true, providerCatalogsOnDemand: true },
    ]);
  });

  it("sends the local-only status flag", async () => {
    const vcs = new VcsApi(new RpcClient(connection, rpcMethods));
    const status = {
      isRepo: true,
      hasPrimaryRemote: false,
      isDefaultRef: true,
      refName: "main",
      hasWorkingTreeChanges: false,
      workingTree: { files: [], insertions: 0, deletions: 0 },
      hasUpstream: false,
      aheadCount: 0,
      behindCount: 0,
      pr: null,
    };
    let received: unknown;
    server.handle("vcs.refreshStatus", (payload) => {
      received = payload;
      return { kind: "value", value: status };
    });
    await expect(vcs.status({ cwd: "/tmp/sample", localOnly: true })).resolves.toMatchObject({
      refName: "main",
    });
    expect(received).toEqual({ cwd: "/tmp/sample", localOnly: true });
    expect(
      rpcMethods["vcs.refreshStatus"].payload.safeParse({ cwd: "/", localOnly: 1 }).success,
    ).toBe(false);
  });
});
