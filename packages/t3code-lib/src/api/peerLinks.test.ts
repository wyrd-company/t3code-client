// ---
// relationships:
//   verifies: library-facades
// ---
import { afterEach, beforeEach, describe, expect, it } from "vite-plus/test";

import { FakeT3Server } from "../../test/support/fakeServer.ts";
import { T3PreconditionError, T3RpcError } from "../errors.ts";
import { RpcClient } from "../rpc/client.ts";
import { rpcMethods } from "../rpc/registry.ts";
import { EnvironmentId, threadId, turnItemId } from "../schemas/common.ts";
import type { PeerLinkRequestAnswerInput } from "../schemas/peerLink.ts";
import { isRpcErrorOfTag } from "../schemas/rpcErrors.ts";
import { RpcConnection } from "../transport/rpcConnection.ts";
import { SocketTransport } from "../transport/socket.ts";
import { PeerLinksApi } from "./peerLinks.ts";

const peer = EnvironmentId.parse("environment-peer");
const pairingCode = "sample-pairing-code";
const link = {
  environmentId: peer,
  label: "Sample peer",
  urls: ["https://peer.example.test"],
  access: "read-only",
  linkedAt: "2026-01-01T00:00:00.000Z",
  expiresAt: "2026-02-01T00:00:00.000Z",
  lastReachedAt: null,
  lastError: null,
};

describe("PeerLinksApi", () => {
  let server: FakeT3Server;
  let connection: RpcConnection;
  let api: PeerLinksApi;

  beforeEach(async () => {
    server = await FakeT3Server.start();
    connection = new RpcConnection(new SocketTransport({ url: async () => server.wsUrl }));
    api = new PeerLinksApi(new RpcClient(connection, rpcMethods));
  });

  afterEach(async () => {
    await connection.close();
    await server.close();
  });

  it("unwraps the listed links and keeps a newer status and access", async () => {
    server.respond("peerLinks.list", {
      links: [
        { ...link, status: "reachable" },
        { ...link, access: "future-access", status: "future-status" },
      ],
    });
    const links = await api.list();
    expect(links.map(({ status, access }) => [status, access])).toEqual([
      ["reachable", "read-only"],
      ["future-status", "future-access"],
    ]);
  });

  it("sends a link input and decodes the link", async () => {
    let received: unknown;
    server.handle("peerLinks.link", (payload) => {
      received = payload;
      return { kind: "value", value: link };
    });
    const input = {
      url: "https://peer.example.test",
      alternateUrls: ["https://peer-alternate.example.test"],
      pairingCode,
      access: "auto" as const,
      expectedEnvironmentId: peer,
      expectedLabel: "Sample peer",
    };
    await expect(api.link(input)).resolves.toMatchObject({ environmentId: peer });
    expect(received).toEqual(input);
  });

  it("refuses an invalid link input locally, with no pairing code in the error", async () => {
    let calls = 0;
    server.handle("peerLinks.link", () => {
      calls += 1;
      return { kind: "value", value: link };
    });
    const error = await api
      .link({ url: "https://peer.example.test", pairingCode, access: "everything" as never })
      .catch((failure: unknown) => failure);
    expect(error).toBeInstanceOf(T3PreconditionError);
    expect(String((error as Error).message)).not.toContain(pairingCode);
    expect(JSON.stringify(error)).not.toContain(pairingCode);
    expect(calls).toBe(0);
  });

  it("returns whether a link was removed", async () => {
    let received: unknown;
    server.handle("peerLinks.unlink", (payload) => {
      received = payload;
      return { kind: "value", value: { removed: false } };
    });
    await expect(api.unlink(peer)).resolves.toBe(false);
    expect(received).toEqual({ environmentId: peer });
  });

  it.each<PeerLinkRequestAnswerInput["answer"]>([
    { type: "decline" },
    { type: "use-existing", environmentId: peer },
    { type: "link", urls: ["https://peer.example.test"], access: "auto", pairingCode },
  ])("answers a link request with $type", async (answer) => {
    let received: unknown;
    server.handle("peerLinks.answerRequest", (payload) => {
      received = payload;
      return { kind: "value", value: null };
    });
    const input = {
      threadId: threadId("thread-1"),
      turnItemId: turnItemId("item-1"),
      answer,
    };
    await expect(api.answerRequest(input)).resolves.toBeUndefined();
    expect(received).toEqual(input);
  });

  it("refuses a link answer with no address", async () => {
    await expect(
      api.answerRequest({
        threadId: threadId("thread-1"),
        turnItemId: turnItemId("item-1"),
        answer: { type: "link", urls: [], access: "auto", pairingCode },
      }),
    ).rejects.toBeInstanceOf(T3PreconditionError);
  });

  it("decodes the typed refusals, with a newer reason kept", async () => {
    const fail = (tag: string, error: { readonly _tag: string } & Record<string, unknown>) =>
      server.handle(tag, () => ({ kind: "fail", error }));
    fail("peerLinks.link", {
      _tag: "PeerLinkError",
      reason: "pairing_rejected",
      message: "Check the pairing code.",
    });
    fail("peerLinks.unlink", {
      _tag: "PeerLinkError",
      reason: "future-reason",
      message: "A newer refusal.",
    });
    fail("peerLinks.answerRequest", { _tag: "PeerLinkRequestError", reason: "not_found" });
    const refusal = (promise: Promise<unknown>) =>
      promise.then(
        () => {
          throw new Error("Expected a refusal.");
        },
        (error: unknown) => {
          if (!(error instanceof T3RpcError)) throw error;
          return error.record;
        },
      );
    const linked = await refusal(
      api.link({ url: "https://peer.example.test", pairingCode, access: "auto" }),
    );
    expect(isRpcErrorOfTag(linked, "PeerLinkError") && linked.reason).toBe("pairing_rejected");
    const unlinked = await refusal(api.unlink(peer));
    expect(isRpcErrorOfTag(unlinked, "PeerLinkError") && unlinked.reason).toBe("future-reason");
    const answered = await refusal(
      api.answerRequest({
        threadId: threadId("thread-1"),
        turnItemId: turnItemId("item-1"),
        answer: { type: "decline" },
      }),
    );
    expect(isRpcErrorOfTag(answered, "PeerLinkRequestError") && answered.reason).toBe("not_found");
  });
});
