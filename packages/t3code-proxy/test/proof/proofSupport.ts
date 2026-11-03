// ---
// relationships:
//   verifies: proxy
// ---
/** The clients, waits and transcript reads that the live proof shares. */
import * as NodeChildProcess from "node:child_process";
import * as NodeCrypto from "node:crypto";
import * as NodeZlib from "node:zlib";
import { serverEnvironment } from "../../../t3code-lib/test/support/serverEnvironment.ts";
import {
  T3Client,
  providerInstanceId,
  threadId as toThreadId,
  type ChatAttachment,
  type ProjectId,
  type ThreadId,
} from "@wyrd-company/t3code-lib";
import { WebSocket } from "ws";

const setting = (name: string) => {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not set. Run the proof with task proxy:test:proof.`);
  return value;
};

export const urls = {
  direct: setting("T3_PROOF_DIRECT"),
  alice: setting("T3_PROOF_ALICE"),
  sam: setting("T3_PROOF_SAM"),
};
export const workspace = setting("T3_PROOF_WORKSPACE");
export const byline = (name: string) => `— Sent by ${name}`;
export const modelSelection = { instanceId: providerInstanceId("codex"), model: "gpt-6-luna" };

export const connect = (
  baseUrl: string,
  options: { readonly webSocket?: unknown; readonly pingIntervalMs?: number } = {},
) =>
  T3Client.create({
    baseUrl,
    accessToken: setting("T3_PROOF_TOKEN"),
    webSocket: (options.webSocket ?? WebSocket) as never,
    ...(options.pingIntervalMs === undefined ? {} : { pingIntervalMs: options.pingIntervalMs }),
  });

/** A new pairing credential. `baseUrl` also gives the pairing link of that hostname. */
export function pairing(baseUrl?: string) {
  const output = NodeChildProcess.execFileSync(
    process.execPath,
    [
      setting("T3_PROOF_BIN"),
      "auth",
      "pairing",
      "create",
      "--base-dir",
      setting("T3_PROOF_HOME"),
    ].concat(["--json"], baseUrl ? ["--base-url", baseUrl] : []),
    { encoding: "utf8", env: serverEnvironment() },
  );
  return JSON.parse(output) as { credential: string; pairUrl?: string };
}

export async function until<T>(
  read: () => Promise<T | undefined>,
  what: string,
  timeoutMs = 240_000,
): Promise<T> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const found = await read();
    if (found !== undefined) return found;
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`Timed out waiting for ${what}.`);
}

/** A valid 32x32 red PNG. */
export function samplePng() {
  const chunk = (type: string, data: Buffer) => {
    const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
    const length = Buffer.alloc(4);
    length.writeUInt32BE(data.length);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(NodeZlib.crc32(body));
    return Buffer.concat([length, body, crc]);
  };
  const size = 32;
  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0);
  header.writeUInt32BE(size, 4);
  header.set([8, 2, 0, 0, 0], 8);
  const row = Buffer.concat([Buffer.from([0]), Buffer.alloc(size * 3, Buffer.from([220, 30, 30]))]);
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", header),
    chunk("IDAT", NodeZlib.deflateSync(Buffer.concat(Array.from({ length: size }, () => row)))),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

/** One proof context: three routes and the project that its threads belong to. */
export function routes() {
  const direct = connect(urls.direct);
  const alice = connect(urls.alice);
  const sam = connect(urls.sam);
  const threads: ThreadId[] = [];
  let projectId: ProjectId | undefined;

  const project = async () => {
    projectId ??= (await direct.projects.ensure({ workspaceRoot: workspace, title: "Sample" })).id;
    return projectId;
  };

  const launch = async (client: T3Client, text?: string, attachments?: ChatAttachment[]) => {
    const threadId = toThreadId(NodeCrypto.randomUUID());
    threads.push(threadId);
    await client.threads.launch({
      threadId,
      projectId: await project(),
      title: "Sample",
      modelSelection,
      runtimeMode: "full-access",
      workspace: { type: "root" },
      ...(text === undefined
        ? {}
        : { initialMessage: { text, ...(attachments ? { attachments } : {}) } }),
    });
    return threadId;
  };

  const items = async (threadId: ThreadId) =>
    (await direct.threads.transcript(threadId)).items.map((row) => row.item);
  const userMessages = async (threadId: ThreadId) =>
    (await items(threadId)).flatMap((item) => (item.type === "user_message" ? [item] : []));
  const replies = async (threadId: ThreadId) =>
    (await items(threadId)).flatMap((item) =>
      item.type === "assistant_message" ? [item.text] : [],
    );

  const running = (threadId: ThreadId) =>
    until(async () => {
      const row = await direct.threads.get(threadId);
      return row?.status === "running" ? row : undefined;
    }, "the run to start");
  const settled = (threadId: ThreadId) =>
    until(async () => {
      const status = await direct.threads.status(threadId);
      const row = await direct.threads.get(threadId);
      if (row?.status === "failed" || row?.status === "interrupted") {
        throw new Error(`The run ended as ${row.status}.`);
      }
      // A new message can be stored before its run starts, and a steer joins the run it steers.
      const last = (await userMessages(threadId)).findLast((m) => m.inputIntent !== "steer");
      const current = status.latestRun?.userMessageId === last?.messageId;
      return row?.status === "completed" && status.queuedRuns.length === 0 && current
        ? row
        : undefined;
    }, "the thread to settle");

  const close = async () => {
    for (const threadId of threads) {
      await direct.threads.interrupt(threadId).catch(() => undefined);
      await direct.threads.delete(threadId).catch(() => undefined);
    }
    await Promise.allSettled([alice.close(), sam.close(), direct.close()]);
  };

  return {
    direct,
    alice,
    sam,
    project,
    launch,
    items,
    userMessages,
    replies,
    running,
    settled,
    close,
  };
}
