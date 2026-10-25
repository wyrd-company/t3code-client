// ---
// relationships:
//   verifies: library
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
import { T3RpcError } from "../../src/errors.ts";
import type { WebSocketConstructor } from "../../src/internal/websocket.ts";
import { threadId, type ProjectId, type ThreadId } from "../../src/schemas/common.ts";

const baseUrl = process.env["T3_LIVE_URL"];
const token = process.env["T3_LIVE_TOKEN"];
const model = process.env["T3_LIVE_MODEL"] ?? "gpt-6-luna";
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

  it("speaks orchestration protocol 2 and reads the granular permissions", async () => {
    const environment = await client.auth.descriptor();
    expect(environment.orchestrationProtocolVersion).toBe(2);
    const session = await client.auth.sessionState();
    expect(session.permissions).toContain("filesystem:read");
    expect(session.auth.serverUpdateScope).toBe("environment:maintain");
  });

  it("reads the stock environment-theme capability through public facades", async () => {
    const environment = await client.server.environment();
    expect(environment.capabilities.environmentThemes).toBe(true);
    const config = await client.server.getConfig();
    expect(config.environment.capabilities.environmentThemes).toBe(true);
  });

  it("reads the stock usage-limit-source capability through public facades", async () => {
    const environment = await client.server.environment();
    expect(environment.capabilities.usageLimitSources).toBe(true);
    const config = await client.server.getConfig();
    expect(config.environment.capabilities.usageLimitSources).toBe(true);
  });

  it("reads the stock usage-price-override capability through public facades", async () => {
    const environment = await client.server.environment();
    expect(environment.capabilities.usagePriceOverrides).toBe(true);
    const config = await client.server.getConfig();
    expect(config.environment.capabilities.usagePriceOverrides).toBe(true);
  });

  it("reads the stock usage-model-alias capability through public facades", async () => {
    const environment = await client.server.environment();
    expect(environment.capabilities.usageModelAliases).toBe(true);
    const config = await client.server.getConfig();
    expect(config.environment.capabilities.usageModelAliases).toBe(true);
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
    const snapshot = await client.projects.snapshot();
    expect(snapshot.projects.find((candidate) => candidate.id === project.id)).toMatchObject({
      workspaceRoot,
      deletedAt: null,
    });
  });

  it("renames a project through projects.mutate", async () => {
    const renamed = await client.projects.ensure({ workspaceRoot, title: "live sample renamed" });
    expect(renamed.title).toBe("live sample renamed");
    expect(await client.projects.get(projectId)).toMatchObject({ title: "live sample renamed" });
  });

  it("ensures a thread idempotently and reads its detail and projection", async () => {
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
    expect(thread.createdBy).toBe("user");
    expect(thread.status).toBe("idle");
    const again = await client.threads.ensure({ ...input, title: "ignored" });
    expect(again.title).toBe("live sample thread");
    const detail = await client.threads.detail(id);
    expect(detail.projection.thread.id).toBe(id);
    expect(detail.projection.runs).toEqual([]);
    const transcript = await client.threads.transcript(id);
    expect(transcript).toMatchObject({ threadId: id, title: "live sample thread", items: [] });
    const projection = await client.threads.projection(id);
    expect(projection.thread.title).toBe("live sample thread");
    expect(client.threads.phase(thread)).toBe("idle");
    expect(await client.threads.pendingRequests(id)).toEqual([]);
  });

  it("finds within a thread and refuses workflow and app requests it cannot serve", async () => {
    const config = await client.rpc.call("server.getConfig", {});
    expect([config.threadFind, config.threadFindProgressive]).toEqual([true, true]);
    const found = await client.rpc.call("orchestration.searchThread", {
      threadId: id,
      query: "no such words",
    });
    expect(found).toMatchObject({ totalMatches: 0, match: null });
    const stop = await client.rpc
      .call("orchestration.stopWorkflow", { threadId: id, subagentId: "node-missing" as never })
      .catch((error: unknown) => error);
    expect(stop).toBeInstanceOf(T3RpcError);
    expect((stop as T3RpcError).is("OrchestrationV2StopWorkflowError")).toBe(true);
    const app = await client.rpc
      .call("mcpApps.toolInfo", { threadId: id, itemId: "item-missing" as never, name: "sample" })
      .catch((error: unknown) => error);
    expect(app).toBeInstanceOf(T3RpcError);
    expect((app as T3RpcError).is("McpAppRequestError")).toBe(true);
  });

  it("updates thread settings through commands", async () => {
    await client.threads.update(id, { title: "live sample thread (renamed)" });
    await client.threads.setRuntimeMode(id, "full-access");
    await client.threads.dispatch({
      type: "thread.auto-settle.set",
      commandId: client.threads.dispatcher.newCommandId(),
      threadId: id,
      enabled: false,
    });
    const detail = await client.threads.detail(id);
    expect(detail.projection.thread).toMatchObject({
      title: "live sample thread (renamed)",
      runtimeMode: "full-access",
      autoSettleDisabledAt: expect.any(String),
    });
    const controller = new AbortController();
    for await (const item of client.threads.watch(id, { signal: controller.signal })) {
      if (item.kind === "snapshot") {
        expect(item.snapshot.projection.thread.runtimeMode).toBe("full-access");
        controller.abort();
      }
    }
  });

  it("archives, lists, unarchives, and tolerates a missing thread", async () => {
    await client.threads.archive(id);
    expect((await client.threads.list({ projectId })).map((t) => t.id)).not.toContain(id);
    expect(
      (await client.threads.list({ projectId, includeArchived: true })).map((t) => t.id),
    ).toContain(id);
    expect((await client.shell.archivedSnapshot()).threads.map((t) => t.id)).toContain(id);
    await client.threads.unarchive(id);
    expect((await client.threads.get(id))?.archivedAt).toBeNull();
    await client.threads.delete(threadId(NodeCrypto.randomUUID()));
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
        if (item.kind === "thread.updated" && item.thread.id === id) controller.abort();
      }
    })();
    // Wait for the snapshot before causing the event so it arrives live.
    while (!seen.some((item) => item.kind === "snapshot"))
      await new Promise((r) => setTimeout(r, 20));
    await client.threads.update(id, { title: "live sample thread (watched)" });
    await watching;
    expect(
      seen.some(
        (item) =>
          item.kind === "thread.updated" && item.thread.id === id && item.location === "active",
      ),
    ).toBe(true);
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
      expect(outcome.runId).toBe(turn.runId);
      expect(outcome.run.userMessageId).toBe(turn.messageId);
      expect(outcome.assistantMessage?.text.toLowerCase()).toContain("pong");
      expect(kinds).toContain("assistant-delta");
      expect(kinds.at(-1)).toBe("turn-settled");
      const transcript = await client.threads.transcript(id);
      const reply = transcript.items.findLast((row) => row.item.type === "assistant_message");
      expect(reply?.item).toMatchObject({ messageId: outcome.assistantMessage?.id });
    },
    180_000,
  );

  it.skipIf(!agent || !queued)(
    "a second message sent during a run is steered or queued by the server and both settle",
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
        for await (const item of second.events()) seen.push(kindOf(item));
      })();
      const [one, two] = await Promise.all([first.completion, second.completion]);
      await consume;
      console.info("second turn saw", seen);
      console.info("outcomes", {
        first: { runId: one.runId, text: one.assistantMessage?.text },
        second: { runId: two.runId, text: two.assistantMessage?.text },
      });
      expect(one.state).toBe("completed");
      expect(two.state).toBe("completed");
      expect(two.assistantMessage?.text.toLowerCase()).toContain("marmalade");
    },
    300_000,
  );
});
