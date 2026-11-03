// ---
// relationships:
//   verifies: library-transport
// ---
/**
 * A guest's routes on a real server, with a stub for the tunnel client and no relay. With
 * `T3_LIVE_AGENT=1`, a `gpt-6-luna` subject answers a sent guest message, so that the routes for a
 * thread's items, a command's output and a reply's image reach their answers.
 */
import * as NodeCrypto from "node:crypto";
import * as NodeFSP from "node:fs/promises";
import * as NodeOS from "node:os";
import * as NodePath from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vite-plus/test";
import { T3AuthError, T3HttpError, T3PreconditionError, type T3Client } from "../../src/index.ts";
import {
  GuestMessageId,
  GuestShareId,
  threadId as toThreadId,
  type ThreadId,
} from "../../src/schemas/common.ts";
import type { GuestStreamEvent } from "../../src/schemas/orchestration/guestStream.ts";
import { isTurnItemOfType } from "../../src/schemas/orchestration/turnItems.ts";
import { hasAgent, hasLiveServer, modelSelection, waitFor } from "./liveClient.ts";
import { TUNNEL_HOST, guestClient, startGuestServer } from "./guestTunnel.ts";
import type { PeerServer } from "./peerServer.ts";

const SAMPLE_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==",
  "base64",
);

type KnownEvent = Extract<GuestStreamEvent, { type: "view" | "thread" | "ended" }>;

const ofType = <T extends KnownEvent["type"]>(
  event: GuestStreamEvent | undefined,
  type: T,
): Extract<KnownEvent, { type: T }> => {
  if (event === undefined || !("type" in event) || event.type !== type) {
    throw new Error(`Expected a ${type} event.`);
  }
  return event as Extract<KnownEvent, { type: T }>;
};

const failure = async (promise: Promise<unknown>) =>
  promise.then(
    () => {
      throw new Error("Expected a refusal.");
    },
    (error: unknown) => error,
  );

describe.skipIf(!hasLiveServer)("live guest routes", () => {
  let server: PeerServer;
  let guest: T3Client;
  let threadId: ThreadId;
  let share: GuestShareId;
  let credential: string;
  let folder: string;

  const query = () => ({ query: { share } });
  const readView = async () => {
    const watch = new AbortController();
    const seen: GuestStreamEvent[] = [];
    for await (const event of guest.routes.stream("guest.stream", query(), watch.signal)) {
      if (event.kind !== "item") throw event.error;
      seen.push(event.value);
      if ("type" in event.value && event.value.type === "thread") break;
    }
    return seen;
  };
  const latestView = async () => {
    const [first] = await readView();
    return ofType(first, "view").view;
  };

  beforeAll(async () => {
    folder = await NodeFSP.realpath(
      await NodeFSP.mkdtemp(NodePath.join(NodeOS.tmpdir(), "t3code-lib-guest-files-")),
    );
    server = await startGuestServer();
    guest = guestClient(server.baseUrl);
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
    const created = await server.client.guestShares.create(threadId);
    expect(created.share.host).toBe(TUNNEL_HOST);
    share = GuestShareId.parse(created.share.id);
    credential = new URL(created.url).hash.slice(1);
  }, 120_000);

  afterAll(async () => {
    await guest?.close();
    await server?.stop();
    await NodeFSP.rm(folder, { recursive: true, force: true });
  });

  it("refuses a guest with no session, and a credential it did not issue", async () => {
    const noSession = await failure(guest.routes.call("guest.session", query()));
    expect(noSession).toBeInstanceOf(T3AuthError);
    expect(noSession).toMatchObject({ status: 403, reason: "invalid" });
    await expect(
      guest.routes.call("guest.redeem", { body: { credential: "sample", name: "Sample guest" } }),
    ).rejects.toMatchObject({ status: 403, reason: "invalid" });
    await expect(guest.routes.stream("guest.stream", query()).next()).rejects.toMatchObject({
      status: 403,
      reason: "invalid",
    });
    await expect(
      guest.routes.call("guest.redeem", { body: { credential, name: "Two\nlines" } }),
    ).rejects.toBeInstanceOf(T3PreconditionError);
  });

  it("redeems the link, and streams the share and the thread", async () => {
    await guest.routes.call("guest.redeem", { body: { credential, name: "Sample guest" } });
    await expect(guest.routes.call("guest.session", query())).resolves.toBeUndefined();
    const owner = await server.client.threads.projection(threadId);
    expect(owner.thread.guestShare?.guestName).toBe("Sample guest");

    const [view, thread] = await readView();
    expect(view).toMatchObject({
      type: "view",
      view: { shareId: share, title: "Sample thread", guestName: "Sample guest", messages: [] },
    });
    expect(thread).toMatchObject({
      type: "thread",
      item: { kind: "snapshot", projection: { thread: { id: threadId } } },
    });
  });

  it("takes a message with a file, and serves the file back", async () => {
    const bytes = new TextEncoder().encode("Sample file text.");
    await expect(
      guest.routes.call("guest.submit", {
        ...query(),
        body: {
          shareId: share,
          text: "Sample proposal.",
          files: [{ name: "sample.txt", mimeType: "text/plain", bytes }],
        },
      }),
    ).resolves.toBeUndefined();
    const { messages } = await latestView();
    expect(messages).toMatchObject([{ text: "Sample proposal.", status: "pending" }]);
    const attachment = messages[0]?.attachments?.[0];
    if (!attachment) throw new Error("The message has no file.");
    const served = await guest.routes.call("guest.attachment", {
      query: { share, id: attachment.id },
    });
    expect(served.contentType).toBe("application/octet-stream");
    expect(new TextDecoder().decode(served.bytes)).toBe("Sample file text.");

    const empty = await failure(
      guest.routes.call("guest.submit", { ...query(), body: { shareId: share, text: "" } }),
    );
    expect(empty).toBeInstanceOf(T3HttpError);
    expect(empty).toMatchObject({ status: 400, reason: "empty" });
    await expect(
      guest.routes.call("guest.submit", {
        query: { share: GuestShareId.parse("sample-other-share") },
        body: { shareId: share, text: "Sample." },
      }),
    ).rejects.toMatchObject({ status: 403 });
    await server.client.guestShares.dismissMessage(threadId, GuestMessageId.parse(messages[0]?.id));
  });

  it("answers `unavailable` for what the thread does not show", async () => {
    const unavailable = { status: 403, reason: "unavailable" };
    await expect(
      guest.routes.call("guest.item", { query: { share, item: "sample-item" } }),
    ).rejects.toMatchObject(unavailable);
    await expect(
      guest.routes.call("guest.render", { query: { share, item: "sample-item" } }),
    ).rejects.toMatchObject(unavailable);
    await expect(
      guest.routes.call("guest.history", { query: { share, cursor: "sample-cursor" } }),
    ).rejects.toMatchObject(unavailable);
    await expect(
      guest.routes.call("guest.attachment", { query: { share, id: "sample-file" } }),
    ).rejects.toMatchObject(unavailable);
    await expect(
      guest.routes.call("guest.media", {
        query: { share, path: NodePath.join(folder, "sample.png") },
      }),
    ).rejects.toMatchObject(unavailable);
    await expect(
      guest.routes.stream("guest.commandOutput", { query: { share, item: "sample-item" } }).next(),
    ).rejects.toMatchObject(unavailable);
  });

  it.skipIf(!hasAgent)(
    "serves an agent's items, command output and image",
    async () => {
      const imagePath = NodePath.join(folder, "sample.png");
      await NodeFSP.writeFile(imagePath, SAMPLE_PNG);
      await guest.routes.call("guest.submit", {
        ...query(),
        body: {
          shareId: share,
          text: `Run the shell command \`echo sample-output\`. Then reply with only this line: ![sample](${imagePath})`,
        },
      });
      const pending = (await latestView()).messages.find(({ status }) => status === "pending");
      await server.client.guestShares.sendMessage(threadId, GuestMessageId.parse(pending?.id));
      await waitFor(
        async () => {
          const read = await server.client.threads.projection(threadId);
          return ["completed", "failed"].includes(read.runs.at(-1)?.status ?? "")
            ? read
            : undefined;
        },
        "the run of the sent message",
        { timeoutMs: 200_000 },
      );

      const [, thread] = await readView();
      const { item: snapshot } = ofType(thread, "thread");
      if (!("kind" in snapshot) || snapshot.kind !== "snapshot") {
        throw new Error("The stream did not send a snapshot.");
      }
      const command = snapshot.projection.turnItems.find((item) =>
        isTurnItemOfType(item, "command_execution"),
      );
      if (!command) throw new Error("The agent ran no command.");
      expect(
        await guest.routes.call("guest.item", { query: { share, item: command.id } }),
      ).toMatchObject({ item: { id: command.id, type: "command_execution" } });

      let output = "";
      for await (const frame of guest.routes.stream("guest.commandOutput", {
        query: { share, item: command.id },
      })) {
        if (frame.kind !== "item") throw frame.error;
        output += JSON.stringify(frame.value);
      }
      expect(output).toContain("sample-output");

      const image = await guest.routes.call("guest.media", { query: { share, path: imagePath } });
      expect(image.contentType).toBe("image/png");
      expect(Buffer.from(image.bytes).equals(SAMPLE_PNG)).toBe(true);
    },
    240_000,
  );

  it("ends the stream and the session when the owner closes the link", async () => {
    const events = guest.routes.stream("guest.stream", query());
    const first = await events.next();
    expect(first.done).toBe(false);
    await server.client.guestShares.close(threadId);
    let last: GuestStreamEvent | undefined;
    for await (const event of events) {
      if (event.kind !== "item") throw event.error;
      last = event.value;
    }
    expect(last).toEqual({ type: "ended" });
    await expect(guest.routes.call("guest.session", query())).rejects.toMatchObject({
      status: 403,
      reason: "inactive",
    });
  });
});
