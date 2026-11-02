// ---
// relationships:
//   verifies: library-facades
// ---
/**
 * Guest shares on a real stock server. A link needs a T3 Connect tunnel, so the
 * test proves `create` through its refusals. It writes a share into the stopped
 * server's thread record, then reads, updates and closes it through the wire.
 * With `T3_LIVE_AGENT=1`, a `gpt-6-luna` subject receives a sent guest message.
 */
import * as NodeCrypto from "node:crypto";
import * as NodeFSP from "node:fs/promises";
import * as NodePath from "node:path";
import { DatabaseSync } from "node:sqlite";
import { afterAll, beforeAll, describe, expect, it } from "vite-plus/test";
import type { T3Client } from "../../src/index.ts";
import { T3RpcDefectError, T3RpcError } from "../../src/index.ts";
import { GuestMessageId, threadId as toThreadId, type ThreadId } from "../../src/schemas/common.ts";
import { isTurnItemOfType } from "../../src/schemas/orchestration/turnItems.ts";
import { isRpcErrorOfTag } from "../../src/schemas/rpcErrors.ts";
import { hasAgent, hasLiveServer, modelSelection, refusal, waitFor } from "./liveClient.ts";
import { startPeerServer, type PeerServer } from "./peerServer.ts";

const dismissed = GuestMessageId.parse("guest-message-dismissed");
const toSend = GuestMessageId.parse("guest-message-to-send");
const guestText = "Sample guest text. Reply with one short sentence.";

const pendingMessage = (id: GuestMessageId) => ({
  id,
  text: guestText,
  status: "pending",
  submittedAt: "2026-01-01T00:00:00.000Z",
});

const createRefusal = async (client: T3Client, threadId: ThreadId) => {
  const record = await refusal(client.guestShares.create(threadId));
  if (!isRpcErrorOfTag(record, "GuestShareCreateError")) {
    throw new Error("Expected a GuestShareCreateError record.");
  }
  return record.reason;
};

async function findDatabase(home: string): Promise<string> {
  const entries = await NodeFSP.readdir(home, { recursive: true, withFileTypes: true });
  const found = entries.find((entry) => entry.isFile() && entry.name === "statev2.sqlite");
  if (!found) throw new Error("The server home has no state database.");
  return NodePath.join(found.parentPath, found.name);
}

/** Add a redeemed share with two pending messages to a stopped server's thread record. */
async function seedShare(home: string, threadId: ThreadId): Promise<void> {
  const database = new DatabaseSync(await findDatabase(home));
  try {
    const expiresAt = new Date(Date.now() + 3_600_000).toISOString();
    const share = {
      id: "sample-share",
      host: "tunnel.example.test",
      createdAt: "2026-01-01T00:00:00.000Z",
      expiresAt,
      guestName: "Sample guest",
      messages: [pendingMessage(dismissed), pendingMessage(toSend)],
    };
    const { changes } = database
      .prepare(
        `UPDATE orchestration_v2_projection_threads
         SET payload_json = json_set(payload_json, '$.guestShare', json(?))
         WHERE thread_id = ?`,
      )
      .run(JSON.stringify(share), threadId);
    if (changes !== 1) throw new Error("The thread record was not found.");
  } finally {
    database.close();
  }
}

// It changes a server setting and a stopped home, so that it uses its own second server.
describe.skipIf(!hasLiveServer)("live guest shares", () => {
  let server: PeerServer;
  let threadId: ThreadId;

  const projection = () => server.client.threads.projection(threadId);
  const share = async () => (await projection()).thread.guestShare;
  const row = () => server.client.threads.get(threadId);

  beforeAll(async () => {
    server = await startPeerServer();
    const project = await server.client.projects.createNew({ name: "Sample project" });
    threadId = toThreadId(NodeCrypto.randomUUID());
    await server.client.threads.ensure({
      threadId,
      projectId: project.projectId,
      title: "Sample thread",
      modelSelection,
      runtimeMode: "auto",
      interactionMode: "default",
    });
  }, 90_000);

  afterAll(async () => {
    await server.stop();
  });

  it("refuses a link while the setting is off, and with no tunnel", async () => {
    await expect(createRefusal(server.client, threadId)).resolves.toBe("disabled");
    await server.client.rpc.callRaw("server.updateSettings", {
      patch: { guestSharingEnabled: true },
    });
    await expect(createRefusal(server.client, threadId)).resolves.toBe("connect_unavailable");
  });

  it("resolves a close with no link, and refuses to resolve a message with no link", async () => {
    await expect(server.client.guestShares.close(threadId)).resolves.toBeUndefined();
    await expect(server.client.guestShares.dismissMessage(threadId, dismissed)).rejects.toThrow(
      T3RpcError,
    );
    await expect(server.client.guestShares.sendMessage(threadId, toSend)).rejects.toThrow(
      T3RpcError,
    );
  });

  it("refuses the internal guest commands from a client", async () => {
    await expect(
      server.client.rpc.callRaw("orchestration.dispatchCommand", {
        type: "thread.guest-share.open",
        commandId: "sample-open-command",
        threadId,
        shareId: "sample-share",
        host: "tunnel.example.test",
        expiresAt: "2026-01-02T00:00:00.000Z",
      }),
    ).rejects.toBeInstanceOf(T3RpcDefectError);
    await expect(share()).resolves.toBeFalsy();
  });

  it("reads, dismisses, sends and closes a stored share", async () => {
    await server.restart((home) => seedShare(home, threadId));

    const stored = await share();
    expect(stored?.guestName).toBe("Sample guest");
    expect(stored?.messages.map(({ id, status }) => [id, status])).toEqual([
      [dismissed, "pending"],
      [toSend, "pending"],
    ]);
    expect((await row())?.pendingGuestMessageCount).toBe(2);

    const watch = new AbortController();
    const events: string[] = [];
    const watching = (async () => {
      for await (const item of server.client.threads.watch(threadId, { signal: watch.signal })) {
        if (item.kind === "event" && "type" in item.event) events.push(item.event.type);
      }
    })().catch(() => undefined);

    await server.client.guestShares.dismissMessage(threadId, dismissed);
    const afterDismiss = await share();
    expect(afterDismiss?.messages.find(({ id }) => id === dismissed)?.status).toBe("dismissed");
    expect((await row())?.pendingGuestMessageCount).toBe(1);
    await expect(server.client.guestShares.dismissMessage(threadId, dismissed)).rejects.toThrow(
      T3RpcError,
    );

    if (hasAgent) {
      const messageId = await server.client.guestShares.sendMessage(threadId, toSend);
      const current = await waitFor(
        async () => {
          const read = await projection();
          return ["completed", "failed"].includes(read.runs.at(-1)?.status ?? "")
            ? read
            : undefined;
        },
        "the run of the sent message",
        { timeoutMs: 200_000 },
      );
      expect(current.runs.at(-1)?.status).toBe("completed");
      const sent = current.turnItems.find(
        (item) => isTurnItemOfType(item, "user_message") && item.messageId === messageId,
      );
      if (!sent || !isTurnItemOfType(sent, "user_message")) {
        throw new Error("The sent guest message is not in the thread.");
      }
      expect(sent.text).toContain("Message from guest Sample guest");
      expect(sent.context?.guest).toMatchObject({
        guestMessageId: toSend,
        name: "Sample guest",
        text: guestText,
      });
      const afterSend = await share();
      expect(afterSend?.messages.find(({ id }) => id === toSend)?.status).toBe("sent");
      expect((await row())?.pendingGuestMessageCount).toBe(0);
    }

    await server.client.guestShares.close(threadId);
    await expect(share()).resolves.toBeNull();
    await new Promise((resolve) => setTimeout(resolve, 500));
    watch.abort();
    await watching;
    expect(events).toContain("thread.guest-share-updated");
  });
});
