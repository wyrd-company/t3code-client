// ---
// relationships:
//   verifies: library-wire
// ---
/** Thread tags and the model-switch divider of 0.1.7, against a real server. */
import { afterAll, beforeAll, describe, expect, it } from "vite-plus/test";
import { T3PreconditionError } from "../../src/errors.ts";
import { isUnknownVariant, type ProjectId, type ThreadId } from "../../src/schemas/common.ts";
import {
  connect,
  hasAgent,
  hasLiveServer,
  modelSelection,
  turnEnded,
  waitFor,
} from "./liveClient.ts";

describe.skipIf(!hasLiveServer)("live thread tags", () => {
  const client = connect();
  let projectId: ProjectId;
  const created: ThreadId[] = [];
  const newThread = async (title: string) => {
    const thread = await client.threads.create({ projectId, title, modelSelection });
    created.push(thread.id);
    return thread.id;
  };
  const setTag = (id: ThreadId, tag: string, tagged: boolean) =>
    client.threads.dispatch({
      type: "thread.tag.set",
      commandId: client.threads.dispatcher.newCommandId(),
      threadId: id,
      tag,
      tagged,
    });
  const shellTags = async (id: ThreadId) =>
    (await client.shell.snapshot()).threads.find((thread) => thread.id === id)?.tags;
  const tagEvent = async (id: ThreadId, afterSequence: number) => {
    const controller = new AbortController();
    for await (const item of client.threads.watch(id, {
      afterSequence,
      signal: controller.signal,
    })) {
      if (item.kind === "decode-error") throw item.error;
      if (item.kind !== "event") continue;
      const { event } = item;
      if (!isUnknownVariant<"type">(event) && event.type === "thread.tags-updated") {
        controller.abort();
        return event;
      }
    }
    throw new Error("The watch ended without thread.tags-updated.");
  };

  beforeAll(async () => {
    ({ projectId } = await client.projects.createNew({ name: "Sample tags" }));
  });
  afterAll(async () => {
    for (const id of created) await client.threads.delete(id).catch(() => undefined);
    await client.projects.delete(projectId, { force: true }).catch(() => undefined);
    await client.close();
  });

  it("adds and removes a tag through thread.tag.set", async () => {
    const id = await newThread("Sample tagged");
    const before = await client.threads.projection(id);
    expect(before.thread.tags ?? []).toEqual([]);

    const added = await setTag(id, "  Sample Tag ", true);
    const event = await tagEvent(id, added.sequence - 1);
    expect(event.payload).toMatchObject({ id, tags: ["Sample Tag"] });
    expect((await client.threads.projection(id)).thread.tags).toEqual(["Sample Tag"]);
    expect(
      await waitFor(
        async () => ((await shellTags(id))?.length ? await shellTags(id) : undefined),
        "the shell tags",
      ),
    ).toEqual(["Sample Tag"]);

    await setTag(id, "sample tag", true);
    expect((await client.threads.projection(id)).thread.tags).toEqual(["Sample Tag", "sample tag"]);

    await setTag(id, "Sample Tag", false);
    await setTag(id, "sample tag", false);
    expect((await client.threads.projection(id)).thread.tags ?? []).toEqual([]);
  });

  it("refuses a malformed tag before sending", async () => {
    const id = await newThread("Sample untagged");
    for (const tag of ["", "x".repeat(65), "one\ntwo"]) {
      await expect(setTag(id, tag, true)).rejects.toBeInstanceOf(T3PreconditionError);
    }
    expect((await client.threads.projection(id)).thread.tags ?? []).toEqual([]);
  });

  it.skipIf(!hasAgent)(
    "marks the message that changes the model with modelSwitch",
    async () => {
      const id = await newThread("Sample switch");
      const first = await client.threads.startTurn({
        threadId: id,
        text: "Reply with the single word one. Do not use tools.",
      });
      await turnEnded(client, id);
      const to = { ...modelSelection, options: [{ id: "reasoningEffort", value: "low" }] };
      const second = await client.threads.startTurn({
        threadId: id,
        text: "Reply with the single word two. Do not use tools.",
        modelSelection: to,
      });
      await turnEnded(client, id);
      const userItems = (await client.threads.projection(id)).turnItems.filter(
        (item) => item.type === "user_message",
      );
      const byMessage = (messageId: string) =>
        userItems.find((item) => "messageId" in item && item.messageId === messageId);
      expect(byMessage(first.messageId)).not.toHaveProperty("modelSwitch");
      expect(byMessage(second.messageId)).toMatchObject({
        modelSwitch: {
          from: { instanceId: modelSelection.instanceId, model: modelSelection.model },
          to,
        },
      });
    },
    300_000,
  );
});
