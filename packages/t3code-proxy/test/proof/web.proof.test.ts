// ---
// relationships:
//   verifies: proxy
// ---
/** The stock web client in a real browser, with one hostname for each person. */
import * as NodeFS from "node:fs";
import * as NodeFSP from "node:fs/promises";
import * as NodeOS from "node:os";
import * as NodePath from "node:path";
import { threadId as toThreadId, type ThreadId } from "@wyrd-company/t3code-lib";
import { afterAll, beforeAll, describe, expect, it } from "vite-plus/test";
import { ATTACHMENT_ONLY_PLACEHOLDER } from "../../src/byline.ts";
import {
  byline,
  pairing,
  receivesFile,
  receivesImage,
  routes,
  samplePng,
  until,
  urls,
} from "./proofSupport.ts";
import { WebClient } from "./webClient.ts";

const evidence = process.env["T3_PROXY_PROOF_EVIDENCE_DIR"];
const SAMPLE_FILE = "SAMPLE-CONTENT-4471\n";

describe("the web client", () => {
  const proof = routes();
  const alice = new WebClient("alice");
  const sam = new WebClient("sam");
  let files = "";

  const shot = async (client: WebClient, name: string) => {
    if (evidence) await client.run("screenshot", NodePath.join(evidence, `${name}.png`));
  };

  const pair = async (client: WebClient, base: string) => {
    const { pairUrl } = pairing(base);
    if (!pairUrl) throw new Error("The server gave no pairing link.");
    await client.run("open", pairUrl);
    await until(
      async () => ((await client.url()).pathname.startsWith("/pair") ? undefined : true),
      "the pairing to complete",
      60_000,
    );
    const session = await client.run(
      "eval",
      "fetch('/api/auth/session').then((r) => r.json()).then((b) => b.authenticated)",
    );
    expect(session).toBe("true");
  };

  /** A new thread with the test model, and the composer ready. */
  const newThread = async (client: WebClient, base: string) => {
    await client.run("open", `${base}/`);
    // A fresh browser shows the setup steps once.
    await until(
      async () => {
        const snapshot = await client.run("snapshot", "-i");
        if (/heading "Set up T3 Code"/u.test(snapshot)) await client.click(/button "Close"/u);
        return /button "New thread"/u.test(snapshot) ? true : undefined;
      },
      "the app",
      30_000,
    );
    await client.click(/button "New thread"/u);
    const picker = await until(
      async () => client.ref(/button "GPT-[^"]*"/u).catch(() => undefined),
      "the model picker",
      30_000,
    );
    if (!/button "GPT-6-Luna/u.test(await client.run("snapshot", "-i"))) {
      await client.run("click", picker);
      await client.click(/option "GPT-6-Luna/u);
      await client.run("press", "Escape");
    }
  };

  const type = async (client: WebClient, text: string) => {
    await client.run("click", await client.ref(/textbox/u));
    await client.run("keyboard", "type", text);
  };

  const submit = async (client: WebClient) => {
    await until(
      async () => client.ref(/button "Submit message"/u).catch(() => undefined),
      "submit",
      30_000,
    );
    await client.click(/button "Submit message"/u);
  };

  const threadOf = async (client: WebClient): Promise<ThreadId> =>
    until(async () => {
      const last = (await client.url()).pathname.split("/").at(-1) ?? "";
      const known = /^[0-9a-f-]{36}$/u.test(last) ? toThreadId(last) : undefined;
      return known && (await proof.direct.threads.get(known)) ? known : undefined;
    }, "the thread");

  const upload = async (client: WebClient, path: string) => {
    await client.run("upload", "input[type=file]", path);
  };

  beforeAll(async () => {
    files = await NodeFSP.mkdtemp(NodePath.join(NodeOS.tmpdir(), "t3code-proxy-proof-web-"));
    NodeFS.writeFileSync(NodePath.join(files, "sample.png"), samplePng());
    NodeFS.writeFileSync(NodePath.join(files, "sample.txt"), SAMPLE_FILE);
    if (evidence) await NodeFSP.mkdir(evidence, { recursive: true });
    await proof.project();
    await pair(alice, urls.alice);
    await pair(sam, urls.sam);
  });

  afterAll(async () => {
    await Promise.allSettled([alice.close(), sam.close()]);
    await proof.close();
    await NodeFSP.rm(files, { recursive: true, force: true });
  });

  it("shows each person's byline in both browsers", async () => {
    await newThread(alice, urls.alice);
    await type(alice, "Reply with: first");
    await submit(alice);
    const threadId = await threadOf(alice);
    await proof.settled(threadId);
    const path = (await alice.url()).pathname;
    await sam.run("open", `${urls.sam}${path}`);
    await until(
      async () => ((await sam.text()).includes(byline("Alice")) ? true : undefined),
      "Alice's byline in Sam's browser",
      30_000,
    );
    await type(sam, "Reply with: second");
    await submit(sam);
    await until(
      async () => ((await proof.userMessages(threadId)).length >= 2 ? true : undefined),
      "Sam's message",
    );
    await proof.settled(threadId);
    expect((await proof.userMessages(threadId)).map((message) => message.text)).toEqual([
      `Reply with: first\n\n${byline("Alice")}`,
      `Reply with: second\n\n${byline("Sam")}`,
    ]);
    for (const client of [alice, sam]) {
      await until(
        async () => {
          const text = await client.text();
          return text.includes(byline("Alice")) && text.includes(byline("Sam")) ? true : undefined;
        },
        "both bylines",
        30_000,
      );
    }
    await shot(alice, "web-alice-bylines");
    await shot(sam, "web-sam-bylines");
  });

  it("shows an image and the byline, and not the placeholder, on a first message and a follow-up", async () => {
    await newThread(alice, urls.alice);
    await upload(alice, NodePath.join(files, "sample.png"));
    await submit(alice);
    const threadId = await threadOf(alice);
    await proof.settled(threadId);
    await upload(alice, NodePath.join(files, "sample.png"));
    await submit(alice);
    await until(
      async () => ((await proof.userMessages(threadId)).length >= 2 ? true : undefined),
      "the follow-up",
    );
    await proof.settled(threadId);

    const messages = await proof.userMessages(threadId);
    expect(messages.map((message) => message.text)).toEqual([byline("Alice"), byline("Alice")]);
    expect(messages.map((message) => message.attachments?.length)).toEqual([1, 1]);
    for (const [index, message] of messages.entries()) {
      await receivesImage(message.attachments?.[0]?.id ?? "", samplePng());
      expect((await proof.turn(threadId, index)).reply).not.toBe("");
    }
    const text = await until(
      async () => {
        const body = await alice.text();
        return body.split(byline("Alice")).length >= 3 ? body : undefined;
      },
      "both bylines",
      30_000,
    );
    expect(text).not.toContain(ATTACHMENT_ONLY_PLACEHOLDER);
    const images = await alice.run(
      "eval",
      "document.querySelectorAll('img[alt=\"sample.png\"]').length",
    );
    expect(Number(images)).toBe(2);
    await shot(alice, "web-alice-image");
  });

  it("keeps a file and the byline on a first message and a follow-up", async () => {
    await newThread(sam, urls.sam);
    await upload(sam, NodePath.join(files, "sample.txt"));
    await submit(sam);
    const threadId = await threadOf(sam);
    await proof.settled(threadId);
    await upload(sam, NodePath.join(files, "sample.txt"));
    await submit(sam);
    await until(
      async () => ((await proof.userMessages(threadId)).length >= 2 ? true : undefined),
      "the follow-up",
    );
    await proof.settled(threadId);

    const messages = await proof.userMessages(threadId);
    for (const message of messages) {
      expect(message.text.endsWith(`\n\n${byline("Sam")}`)).toBe(true);
      expect(message.text).not.toContain(ATTACHMENT_ONLY_PLACEHOLDER);
      expect(message.attachments).toHaveLength(1);
    }
    expect(messages).toHaveLength(2);
    for (const [index, message] of messages.entries()) {
      await receivesFile(message.attachments?.[0]?.id ?? "", SAMPLE_FILE);
      expect((await proof.turn(threadId, index)).reply).not.toBe("");
    }
    await shot(sam, "web-sam-file");
  });
});
