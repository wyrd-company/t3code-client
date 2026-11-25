// ---
// relationships:
//   verifies: library
// ---
import { afterEach, beforeEach, describe, expect, it } from "vite-plus/test";
import { FakeT3Server } from "../../test/support/fakeServer.ts";
import { makeProjection } from "../../test/support/threadFixtures.ts";
import { T3AuthError } from "../errors.ts";
import { RpcClient } from "../rpc/client.ts";
import { rpcMethods } from "../rpc/registry.ts";
import { RpcConnection } from "../transport/rpcConnection.ts";
import { SocketTransport } from "../transport/socket.ts";
import { mcpClientScopes } from "../auth/scopes.ts";
import { decodeRpcErrorRecord, isRpcErrorOfTag } from "./rpcErrors.ts";

const thread = { environmentId: "environment-2", threadId: "thread-9" };
const target = {
  environmentId: "environment-2",
  label: "Sample peer",
  urls: ["https://peer.invalid"],
};

describe("linked environment threads and pairing (0.1.12)", () => {
  it("names links, and reads a linked thread's stream, history pages and items", () => {
    const names = rpcMethods["peerLinks.names"].success;
    expect(names.parse({ links: [{ environmentId: "environment-2", label: "Peer" }] })).toEqual({
      links: [{ environmentId: "environment-2", label: "Peer" }],
    });
    const subscribe = rpcMethods["peerLinks.subscribeThread"];
    expect(subscribe.stream).toBe(true);
    expect(subscribe.payload.safeParse({ threadId: "thread-9" }).success).toBe(false);
    const snapshot = { kind: "snapshot", snapshotSequence: 3, projection: makeProjection() };
    expect(subscribe.success.parse(snapshot)).toMatchObject({ kind: "snapshot" });
    const history = rpcMethods["peerLinks.threadHistoryPage"].payload;
    expect(history.parse({ ...thread, cursor: "cursor-1" })).toEqual({
      ...thread,
      cursor: "cursor-1",
    });
    expect(history.safeParse(thread).success).toBe(false);
    const item = rpcMethods["peerLinks.threadItem"].payload;
    expect(item.parse({ ...thread, itemId: "item-1", revision: "r1" })).toMatchObject({
      itemId: "item-1",
    });
  });

  it("decodes a pairing credential, a refusal, and a kind this build does not know", () => {
    const success = rpcMethods["peerLinks.pairClient"].success;
    const credential = {
      type: "credential",
      ...target,
      credential: "pairing-credential",
      expiresAt: "2020-01-01T00:00:00.000Z",
    };
    expect(success.parse(credential)).toEqual(credential);
    expect(success.parse({ type: "unsupported", ...target, reason: "link_access" })).toMatchObject({
      reason: "link_access",
    });
    expect(success.parse({ type: "later", ...target })).toMatchObject({ unknown: true });
    expect(success.safeParse({ type: "credential", ...target }).success).toBe(false);
  });

  it("asks for the access a link pairing hands out on top of access:write", () => {
    const pairLink = rpcMethods["peerLinks.pairLink"];
    const scopesFor = (access: string) =>
      pairLink.payloadScopes?.(pairLink.payload.parse({ environmentId: "environment-2", access }));
    expect(scopesFor("read-only")).toEqual(["orchestration:read"]);
    expect(scopesFor("auto")).toEqual(["orchestration:read", "orchestration:operate"]);
    expect(scopesFor("full-access")).toEqual([
      "orchestration:read",
      "orchestration:operate",
      "settings:write",
      "source-control:write",
    ]);
    expect(mcpClientScopes("approval-required")).toEqual(scopesFor("approval-required"));
    expect(
      pairLink.payload.safeParse({ environmentId: "environment-2", access: "everything" }).success,
    ).toBe(false);
  });

  it("reads the peer's answer to an unlink and the thread read failure", () => {
    const unlink = rpcMethods["peerLinks.unlink"].success;
    expect(unlink.parse({ removed: true, endedThere: false })).toEqual({
      removed: true,
      endedThere: false,
    });
    expect(unlink.parse({ removed: true })).not.toHaveProperty("endedThere");
    const failure = decodeRpcErrorRecord({
      _tag: "PeerLinkThreadReadError",
      reason: "incompatible",
      label: null,
      message: "The linked environment is too old.",
    });
    expect(isRpcErrorOfTag(failure, "PeerLinkThreadReadError") && failure.reason).toBe(
      "incompatible",
    );
  });

  describe("the local scope check", () => {
    let server: FakeT3Server;
    let connection: RpcConnection;

    beforeEach(async () => {
      server = await FakeT3Server.start();
      connection = new RpcConnection(new SocketTransport({ url: async () => server.wsUrl }));
      server.handle("peerLinks.pairLink", () => ({
        kind: "value",
        value: { type: "unsupported", ...target, reason: "refused" },
      }));
    });
    afterEach(async () => {
      await connection.close();
      await server.close();
    });

    it("refuses a full-access link pairing to a credential that cannot write settings", async () => {
      const input = rpcMethods["peerLinks.pairLink"].payload.parse({
        environmentId: "environment-2",
        access: "full-access",
      });
      const limited = new RpcClient(connection, rpcMethods, {
        getScopes: () => ["access:write", "orchestration:read", "orchestration:operate"],
      });
      await expect(limited.call("peerLinks.pairLink", input)).rejects.toMatchObject({
        code: "insufficient_scope",
        requiredScope: "settings:write",
      });
      await expect(limited.call("peerLinks.pairLink", input)).rejects.toBeInstanceOf(T3AuthError);
      const full = new RpcClient(connection, rpcMethods, {
        getScopes: () => ["access:write", ...mcpClientScopes("full-access")],
      });
      expect(await full.call("peerLinks.pairLink", input)).toMatchObject({ reason: "refused" });
    });
  });
});
