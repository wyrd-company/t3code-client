// ---
// relationships:
//   verifies: library-facades
// ---
import { afterEach, beforeEach, describe, expect, it } from "vite-plus/test";

import { FakeT3Server } from "../../test/support/fakeServer.ts";
import { T3RpcError } from "../errors.ts";
import { RpcClient } from "../rpc/client.ts";
import { rpcMethods } from "../rpc/registry.ts";
import { GuestMessageId, threadId } from "../schemas/common.ts";
import { THREAD_STATE_EVENT_TYPES } from "../schemas/orchestration/events.ts";
import { ThreadGuestShare } from "../schemas/orchestration/guestShare.ts";
import { OrchestrationMessageContext } from "../schemas/orchestration/messageContext.ts";
import { isRpcErrorOfTag } from "../schemas/rpcErrors.ts";
import { RpcConnection } from "../transport/rpcConnection.ts";
import { SocketTransport } from "../transport/socket.ts";
import { CommandDispatcher } from "./dispatch.ts";
import { GuestSharesApi } from "./guestShares.ts";

const thread = threadId("thread-1");
const guestMessage = GuestMessageId.parse("guest-message-1");
const share = {
  id: "share-1",
  host: "tunnel.example.test",
  createdAt: "2026-01-01T00:00:00.000Z",
  expiresAt: "2026-01-02T00:00:00.000Z",
  guestName: null,
  messages: [],
};

describe("GuestSharesApi", () => {
  let server: FakeT3Server;
  let connection: RpcConnection;
  let api: GuestSharesApi;

  beforeEach(async () => {
    server = await FakeT3Server.start();
    connection = new RpcConnection(new SocketTransport({ url: async () => server.wsUrl }));
    const rpc = new RpcClient(connection, rpcMethods);
    api = new GuestSharesApi(rpc, new CommandDispatcher(rpc));
  });

  afterEach(async () => {
    await connection.close();
    await server.close();
  });

  it("creates a link and decodes its share", async () => {
    let received: unknown;
    server.handle("guestShare.create", (payload) => {
      received = payload;
      return { kind: "value", value: { url: "https://tunnel.example.test/guest#sample", share } };
    });
    const created = await api.create(thread);
    expect(received).toEqual({ threadId: thread });
    expect(created.share.id).toBe("share-1");
    expect(created.share.guestName).toBeNull();
  });

  it("types a refusal, and keeps an unknown reason", async () => {
    server.handle("guestShare.create", () => ({
      kind: "fail",
      error: {
        _tag: "GuestShareCreateError",
        reason: "disabled",
      },
    }));
    const outcome = await api.create(thread).catch((error: unknown) => error);
    if (!(outcome instanceof T3RpcError)) throw new Error("Expected a refusal.");
    expect(isRpcErrorOfTag(outcome.record, "GuestShareCreateError")).toBe(true);
    expect(outcome.record).toMatchObject({ reason: "disabled" });

    server.handle("guestShare.create", () => ({
      kind: "fail",
      error: {
        _tag: "GuestShareCreateError",
        reason: "a_later_reason",
      },
    }));
    const later = await api.create(thread).catch((error: unknown) => error);
    if (!(later instanceof T3RpcError)) throw new Error("Expected a refusal.");
    expect(later.record).toMatchObject({ reason: "a_later_reason" });
  });

  it("dispatches close, dismiss and send", async () => {
    const commands: Array<Record<string, unknown>> = [];
    server.handle("orchestration.dispatchCommand", (payload) => {
      commands.push(payload as Record<string, unknown>);
      return { kind: "value", value: { sequence: commands.length } };
    });
    await api.close(thread);
    await api.dismissMessage(thread, guestMessage);
    const messageId = await api.sendMessage(thread, guestMessage);
    expect(commands.map((command) => command["type"])).toEqual([
      "thread.guest-share.close",
      "thread.guest-message.dismiss",
      "message.dispatch",
    ]);
    expect(commands[1]).toMatchObject({ threadId: thread, guestMessageId: guestMessage });
    expect(commands[2]).toMatchObject({
      threadId: thread,
      guestMessageId: guestMessage,
      messageId,
      text: "",
      attachments: [],
      dispatchMode: { type: "queue_after_active" },
    });
  });
});

describe("guest share schemas", () => {
  it("applies a guest share update as a thread state event", () => {
    expect(THREAD_STATE_EVENT_TYPES).toContain("thread.guest-share-updated");
  });

  it("keeps a later message status", () => {
    const parsed = ThreadGuestShare.parse({
      ...share,
      guestName: "Sample guest",
      messages: [
        {
          id: "guest-message-2",
          text: "Sample text",
          status: "a_later_status",
          submittedAt: "2026-01-01T00:00:00.000Z",
        },
      ],
    });
    expect(parsed.messages[0]?.status).toBe("a_later_status");
  });

  it("decodes the attribution on a sent guest message", () => {
    const context = OrchestrationMessageContext.parse({
      version: 1,
      guest: { guestMessageId: "guest-message-2", name: "Sample guest", text: "Sample text" },
      records: [],
    });
    expect(context.guest?.name).toBe("Sample guest");
  });
});
