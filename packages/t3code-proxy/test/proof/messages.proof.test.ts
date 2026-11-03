// ---
// relationships:
//   verifies: proxy
// ---
/** Each way a person sends text, with real turns, through HTTPS and a person's hostname. */
import { afterAll, describe, expect, it } from "vite-plus/test";
import { byline, routes, until } from "./proofSupport.ts";

const ASK_NAME = "Reply with only the name in the line of this message that starts with a dash.";
const SLOW = "Run the shell command `sleep 25`. Then reply with: done";

describe("messages through a person's hostname", () => {
  const proof = routes();
  afterAll(proof.close);

  it("runs with no inherited setting that names another T3 Code server", () => {
    for (const name of ["T3CODE_PORT", "T3CODE_HOST", "T3CODE_HOME"]) {
      expect(process.env[name]).toBeUndefined();
    }
  });

  it("stores each byline on a first message and a follow-up, and the agent receives them", async () => {
    const threadId = await proof.launch(proof.alice, ASK_NAME);
    await proof.settled(threadId);
    const first = await proof.turn(threadId, 0);
    expect(first.message.text).toBe(`${ASK_NAME}\n\n${byline("Alice")}`);
    expect(first.reply).toMatch(/Alice/u);

    await proof.sam.threads.startTurn({ threadId, text: ASK_NAME });
    await until(
      async () => ((await proof.userMessages(threadId)).length >= 2 ? true : undefined),
      "Sam's message",
    );
    await proof.settled(threadId);
    const followUp = await proof.turn(threadId, 1);
    expect(followUp.message.text).toBe(`${ASK_NAME}\n\n${byline("Sam")}`);
    expect(followUp.reply).toMatch(/Sam/u);
  });

  it("stores no byline on the direct route", async () => {
    const threadId = await proof.launch(proof.direct, "Reply with: ok");
    await proof.settled(threadId);
    await proof.direct.threads.startTurn({ threadId, text: "Reply with: fine" });
    await until(
      async () => ((await proof.userMessages(threadId)).length >= 2 ? true : undefined),
      "the follow-up",
    );
    await proof.settled(threadId);
    expect((await proof.userMessages(threadId)).map((message) => message.text)).toEqual([
      "Reply with: ok",
      "Reply with: fine",
    ]);
  });

  it("stores the byline of a steer, and the running agent receives it", async () => {
    // The first message has no byline, so that only the steer can give the agent a name.
    const threadId = await proof.launch(proof.direct, SLOW);
    await proof.running(threadId);
    const text = `Add the name in the line of this message that starts with a dash to your final reply.`;
    await proof.sam.threads.startTurn({ threadId, text, delivery: "steer" });
    await proof.settled(threadId);
    const texts = (await proof.userMessages(threadId)).map((message) => message.text);
    expect(texts).toContain(`${text}\n\n${byline("Sam")}`);
    expect((await proof.replies(threadId)).join("\n")).toMatch(/Sam/u);
  });

  it("stores the byline of a queued message, and of a queue edit with the editor's name", async () => {
    // The first message has no byline. Each queued run must report the name of its own message.
    const threadId = await proof.launch(proof.direct, SLOW);
    await proof.running(threadId);
    await proof.alice.threads.startTurn({ threadId, text: ASK_NAME, delivery: "queue" });
    await proof.alice.threads.startTurn({ threadId, text: ASK_NAME, delivery: "queue" });
    const runId = await until(async () => {
      const { queuedRuns } = await proof.direct.threads.status(threadId);
      return queuedRuns.length === 2 ? queuedRuns[1]?.id : undefined;
    }, "the queued runs");
    // A client starts from the stored text, with the cursor after the byline.
    await proof.sam.threads.dispatch({
      type: "queued-run.edit",
      commandId: proof.sam.threads.dispatcher.newCommandId(),
      threadId,
      runId,
      text: `${ASK_NAME}\n\n${byline("Alice")} Use one word.`,
    });
    await proof.settled(threadId);

    const queued = await proof.turn(threadId, 1);
    expect(queued.message.text).toBe(`${ASK_NAME}\n\n${byline("Alice")}`);
    expect(queued.reply).toMatch(/Alice/u);
    const edited = await proof.turn(threadId, 2);
    expect(edited.message.text).toBe(`${ASK_NAME} Use one word.\n\n${byline("Sam")}`);
    expect(edited.reply).toMatch(/Sam/u);
    expect(edited.reply).not.toMatch(/Alice/u);
  });

  it("compacts the thread with /compact, with no byline", async () => {
    const threadId = await proof.launch(proof.alice, "Reply with: ok");
    await proof.settled(threadId);
    await proof.alice.threads.startTurn({ threadId, text: "/compact" });
    await until(async () => {
      const items = await proof.items(threadId);
      return items.some((item) => item.type === "compaction") ? true : undefined;
    }, "the compaction");
    const texts = (await proof.userMessages(threadId)).map((message) => message.text);
    expect(texts.filter((text) => text.includes("/compact") && text.includes("Sent by"))).toEqual(
      [],
    );
  });
});
