// ---
// relationships:
//   verifies: proxy
// ---
/** The placeholder rule with real image turns on the wire. The browser proof covers the display. */
import type { T3Client } from "@wyrd-company/t3code-lib";
import { afterAll, describe, expect, it } from "vite-plus/test";
import { ATTACHMENT_ONLY_PLACEHOLDER } from "../../src/byline.ts";
import { byline, routes, samplePng, until, urls } from "./proofSupport.ts";

const SAMPLE_PNG = samplePng();
/** The sample image is a red square, so that a reply can show that the agent received it. */
const RED = /\bred\b/iu;

/** Uploads an image through one person's hostname, as a client does. */
async function image(client: T3Client, base: string) {
  const issued = (await client.rpc.callRaw("attachments.createUploadUrl", {
    type: "image",
    name: "sample.png",
    mimeType: "image/png",
    sizeBytes: SAMPLE_PNG.length,
  })) as { attachmentId: string; relativeUrl: string };
  const uploaded = await fetch(new URL(issued.relativeUrl, base), {
    method: "POST",
    headers: { "content-type": "image/png" },
    body: SAMPLE_PNG,
  });
  expect(uploaded.status).toBe(204);
  return {
    type: "image",
    id: issued.attachmentId,
    name: "sample.png",
    mimeType: "image/png",
    sizeBytes: SAMPLE_PNG.length,
  } as const;
}

describe("messages with only attachments", () => {
  const proof = routes();
  afterAll(proof.close);

  it("stores only the byline on a first message and a follow-up, and the agent replies", async () => {
    const threadId = await proof.launch(proof.alice, ATTACHMENT_ONLY_PLACEHOLDER, [
      await image(proof.alice, urls.alice),
    ]);
    await proof.settled(threadId);
    const first = await proof.turn(threadId, 0);
    expect(first.message.text).toBe(byline("Alice"));
    expect(first.message.attachments).toHaveLength(1);
    expect(first.reply).toMatch(RED);

    await proof.sam.threads.startTurn({
      threadId,
      text: ATTACHMENT_ONLY_PLACEHOLDER,
      attachments: [await image(proof.sam, urls.sam)],
    });
    await until(
      async () => ((await proof.userMessages(threadId)).length >= 2 ? true : undefined),
      "the follow-up",
    );
    await proof.settled(threadId);
    const second = await proof.turn(threadId, 1);
    expect(second.message.text).toBe(byline("Sam"));
    expect(second.message.attachments).toHaveLength(1);
    expect(second.reply).toMatch(RED);
  });

  it("keeps the Ultrathink prefix and replaces only the placeholder", async () => {
    const threadId = await proof.launch(proof.alice, `Ultrathink: ${ATTACHMENT_ONLY_PLACEHOLDER}`, [
      await image(proof.alice, urls.alice),
    ]);
    await proof.settled(threadId);
    expect((await proof.userMessages(threadId))[0]?.text).toBe(`Ultrathink: ${byline("Alice")}`);
  });

  it("gives the editor's byline alone to a queue edit that sends the placeholder", async () => {
    const threadId = await proof.launch(
      proof.alice,
      "Run the shell command `sleep 20`. Then reply with: done",
    );
    await proof.running(threadId);
    await proof.alice.threads.startTurn({
      threadId,
      text: ATTACHMENT_ONLY_PLACEHOLDER,
      attachments: [await image(proof.alice, urls.alice)],
      delivery: "queue",
    });
    const runId = await until(async () => {
      const { queuedRuns } = await proof.direct.threads.status(threadId);
      return queuedRuns[0]?.id;
    }, "the queued run");
    await proof.sam.threads.dispatch({
      type: "queued-run.edit",
      commandId: proof.sam.threads.dispatcher.newCommandId(),
      threadId,
      runId,
      text: ATTACHMENT_ONLY_PLACEHOLDER,
    });
    await proof.settled(threadId);
    const edited = await proof.turn(threadId, 1);
    expect(edited.message.text).toBe(byline("Sam"));
    expect(edited.message.attachments).toHaveLength(1);
    expect(edited.reply).toMatch(RED);
  });
});
