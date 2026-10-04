// ---
// relationships:
//   verifies: design
// ---
/**
 * Facade round trip against a real T3 Code server, reached through
 * T3_LIVE_URL and T3_LIVE_TOKEN (see globalSetup.ts). T3_LIVE_AGENT=1 also
 * runs a real agent turn.
 */
import * as NodeCrypto from "node:crypto";
import * as NodeFSP from "node:fs/promises";
import * as NodeOS from "node:os";
import * as NodePath from "node:path";
import { WebSocket as WsWebSocket } from "ws";
import { afterAll, beforeAll, describe, expect, it } from "vite-plus/test";
import type { ShellWatchItem } from "../../src/api/shell.ts";
import { T3Client } from "../../src/client.ts";
import type { WebSocketConstructor } from "../../src/internal/websocket.ts";
import { threadId, type ProjectId, type ThreadId } from "../../src/schemas/common.ts";

const baseUrl = process.env["T3_LIVE_URL"];
const token = process.env["T3_LIVE_TOKEN"];
const model = process.env["T3_LIVE_MODEL"] ?? "gpt-5.6-luna";
const enabled = Boolean(baseUrl) && Boolean(token);
const agent = process.env["T3_LIVE_AGENT"] === "1";
/** Run the two-turn queued scenario instead of the single turn (two agent turns, not three). */
const queued = process.env["T3_LIVE_QUEUED"] === "1";
/** Set only when globalSetup started the server, so its data directory is a temp folder. */
const liveHome = process.env["T3_LIVE_HOME"];

const kindOf = (item: { kind: string; event?: unknown }): string =>
  item.kind === "event" ? `event:${String((item.event as { type?: string }).type)}` : item.kind;

describe.skipIf(!enabled)("live facades", () => {
  let client: T3Client;
  let workspaceRoot: string;
  let projectId: ProjectId;
  const id: ThreadId = threadId(NodeCrypto.randomUUID());

  beforeAll(async () => {
    workspaceRoot = await NodeFSP.mkdtemp(NodePath.join(NodeOS.tmpdir(), "t3code-client-live-"));
    client = T3Client.create({
      baseUrl: baseUrl ?? "",
      accessToken: token ?? "",
      clientLabel: "t3code-client-live",
      webSocket: WsWebSocket as unknown as WebSocketConstructor,
    });
  });

  afterAll(async () => {
    try {
      await client.threads.delete(id);
      if (projectId) await client.projects.delete(projectId, { force: true });
    } finally {
      await client.close();
      await NodeFSP.rm(workspaceRoot, { recursive: true, force: true });
    }
  });

  it("ensures a project idempotently", async () => {
    const project = await client.projects.ensure({ workspaceRoot, title: "live sample" });
    projectId = project.id;
    const again = await client.projects.ensure({
      workspaceRoot: `${workspaceRoot}/`,
      title: "live sample",
    });
    expect(again.id).toBe(project.id);
    expect(await client.projects.findByWorkspaceRoot(workspaceRoot)).toMatchObject({
      id: project.id,
    });
  });

  it("ensures a thread idempotently and reads its detail", async () => {
    const input = {
      threadId: id,
      projectId,
      title: "live sample thread",
      modelSelection: { instanceId: "codex" as never, model },
      runtimeMode: "auto" as const,
    };
    const thread = await client.threads.ensure(input);
    expect(thread.id).toBe(id);
    expect(thread.runtimeMode).toBe("auto");
    const again = await client.threads.ensure({ ...input, title: "ignored" });
    expect(again.title).toBe("live sample thread");
    const detail = await client.threads.detail(id);
    expect(detail.thread.id).toBe(id);
    expect(client.threads.phase(thread)).toBe("idle");
    expect(await client.threads.pendingRequests(id)).toEqual([]);
  });

  it("reads the full read model with the created project and thread", async () => {
    const controller = new AbortController();
    const readModel = await client.shell.readModel(controller.signal);
    expect(readModel.snapshotSequence).toBeGreaterThan(0);
    expect(readModel.projects.find((project) => project.id === projectId)).toMatchObject({
      workspaceRoot,
    });
    expect(readModel.threads.find((thread) => thread.id === id)).toMatchObject({
      projectId,
      title: "live sample thread",
      messages: [],
      activities: [],
      checkpoints: [],
    });
    expect(Number.isNaN(Date.parse(readModel.updatedAt))).toBe(false);
  });

  it("turns automatic settlement off and accepts the reasoning opt-in", async () => {
    await client.threads.dispatch({
      type: "thread.auto-settle.set",
      commandId: client.threads.dispatcher.newCommandId(),
      threadId: id,
      enabled: false,
    });
    const detail = await client.threads.detail(id, { reasoningMessages: true });
    expect(detail.thread.autoSettleDisabledAt).toEqual(expect.any(String));
    const controller = new AbortController();
    for await (const item of client.threads.watch(id, {
      reasoningMessages: true,
      signal: controller.signal,
    })) {
      if (item.kind === "snapshot") {
        expect(item.snapshot.thread.autoSettleDisabledAt).toEqual(expect.any(String));
        controller.abort();
      }
    }
    expect((await client.server.getConfig()).reasoningMessages).toBe(true);
  });

  // Both create folders in the server's data directory, so they run only
  // against the server globalSetup started in a temp folder.
  it.skipIf(!liveHome)("ensures the Scratch project idempotently", async () => {
    const config = await client.server.getConfig();
    expect(config.scratchWorkspaceRoot).toBe(NodePath.join(liveHome ?? "", "scratch"));
    const first = await client.projects.ensureScratch();
    const second = await client.projects.ensureScratch();
    expect(second.projectId).toBe(first.projectId);
    expect(await client.projects.get(first.projectId)).toMatchObject({
      workspaceRoot: config.scratchWorkspaceRoot,
    });
  });

  it.skipIf(!liveHome)("creates a project from a name", async () => {
    const config = await client.server.getConfig();
    expect(config.newProjectsRoot).toBe(NodePath.join(liveHome ?? "", "projects"));
    const created = await client.projects.createNew({ name: "Live sample" });
    try {
      expect(NodePath.dirname(created.workspaceRoot)).toBe(config.newProjectsRoot);
      expect(await client.projects.get(created.projectId)).toMatchObject({
        title: "Live sample",
        workspaceRoot: created.workspaceRoot,
      });
    } finally {
      await client.projects.delete(created.projectId, { force: true });
    }
  });

  it("sees the thread on the shell watch", async () => {
    const controller = new AbortController();
    const seen: ShellWatchItem[] = [];
    const watching = (async () => {
      for await (const item of client.shell.watch({ signal: controller.signal })) {
        seen.push(item);
        if (item.kind === "thread-upserted" && item.thread.id === id) controller.abort();
      }
    })();
    // Wait for the snapshot before causing the event so it arrives live.
    while (!seen.some((item) => item.kind === "snapshot"))
      await new Promise((r) => setTimeout(r, 20));
    await client.threads.update(id, { title: "live sample thread (renamed)" });
    await watching;
    expect(seen.some((item) => item.kind === "thread-upserted" && item.thread.id === id)).toBe(
      true,
    );
  });

  it.skipIf(!agent || queued)(
    "runs a turn to completion",
    async () => {
      const started = Date.now();
      const turn = await client.threads.startTurn({
        threadId: id,
        text: "Reply with exactly the word pong and nothing else.",
      });
      const kinds: string[] = [];
      const consume = (async () => {
        for await (const item of turn.events()) kinds.push(kindOf(item));
      })();
      const outcome = await turn.completion;
      await consume;
      console.info(`turn settled in ${Date.now() - started} ms`, kinds);
      expect(outcome.state).toBe("completed");
      expect(outcome.turnId).not.toBeNull();
      expect(outcome.assistantMessage?.text.toLowerCase()).toContain("pong");
      expect(kinds.at(-1)).toBe("turn-settled");
    },
    180_000,
  );

  it.skipIf(!agent || !queued)(
    "a turn started while another is starting is folded into that turn and both settle",
    async () => {
      const first = await client.threads.startTurn({
        threadId: id,
        text: "Count slowly from one to five, one number per line, then stop.",
      });
      const second = await client.threads.startTurn({
        threadId: id,
        text: "Reply with exactly the word marmalade and nothing else.",
      });
      const seen: string[] = [];
      const consume = (async () => {
        for await (const item of second.events()) {
          const detail =
            item.kind === "event"
              ? JSON.stringify((item.event as { payload?: unknown }).payload).slice(0, 160)
              : "";
          seen.push(`${kindOf(item)} ${detail}`);
        }
      })();
      const [one, two] = await Promise.all([first.completion, second.completion]);
      await consume;
      console.info("second turn saw", seen);
      console.info("outcomes", {
        first: { turnId: one.turnId, text: one.assistantMessage?.text },
        second: { turnId: two.turnId, text: two.assistantMessage?.text },
      });
      expect(one.state).toBe("completed");
      expect(two.state).toBe("completed");
      expect(one.turnId).not.toBeNull();
      // Providers steer a message sent during an active turn into that turn.
      expect(two.turnId).toBe(one.turnId);
      expect(two.assistantMessage?.text.toLowerCase()).toContain("marmalade");
    },
    300_000,
  );
});
