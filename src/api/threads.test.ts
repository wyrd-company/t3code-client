import { afterEach, beforeEach, describe, expect, it } from "vite-plus/test";
import { FakeT3Server } from "../../test/support/fakeServer.ts";
import {
  ids,
  makeProjection,
  makeShellSnapshot,
  makeShellThread,
  makeSnapshot,
  modelSelection as sampleModel,
} from "../../test/support/threadFixtures.ts";
import { RpcClient } from "../rpc/client.ts";
import { rpcMethods } from "../rpc/registry.ts";
import { projectId, threadId } from "../schemas/common.ts";
import { ModelSelection } from "../schemas/orchestration/model.ts";
import type { OrchestrationV2ThreadShell } from "../schemas/orchestration/shell.ts";
import { HttpTransport } from "../transport/http.ts";
import { RpcConnection } from "../transport/rpcConnection.ts";
import { SocketTransport } from "../transport/socket.ts";
import { CommandDispatcher } from "./dispatch.ts";
import { ThreadsApi } from "./threads.ts";

const dispatchFailure = (detail: string) => ({
  kind: "fail" as const,
  error: {
    _tag: "OrchestrationV2DispatchCommandError",
    commandId: "command-1",
    commandType: "thread.delete",
    message: "Orchestration command failed.",
    detail,
  },
});
const protocolHeader = { "x-t3-orchestration-protocol": "2" };
const modelSelection = ModelSelection.parse(sampleModel);

describe("ThreadsApi: reads and lifecycle", () => {
  let server: FakeT3Server;
  let connection: RpcConnection;
  let threads: ThreadsApi;
  let shellThreads: OrchestrationV2ThreadShell[];
  let archivedThreads: OrchestrationV2ThreadShell[];
  let dispatched: Record<string, unknown>[];

  beforeEach(async () => {
    server = await FakeT3Server.start();
    shellThreads = [makeShellThread()];
    archivedThreads = [makeShellThread({ id: "thread-archived", projectId: "project-2" })];
    dispatched = [];
    connection = new RpcConnection(new SocketTransport({ url: async () => server.wsUrl }));
    const rpc = new RpcClient(connection, rpcMethods);
    const http = new HttpTransport({
      baseUrl: server.httpUrl,
      fetch: server.fetch,
      getAccessToken: async () => "token-1",
    });
    threads = new ThreadsApi(http, rpc, new CommandDispatcher(rpc));
    server.routes.route("GET /api/orchestration/shell", () => ({
      status: 200,
      body: makeShellSnapshot({ threads: shellThreads, archivedThreads }),
    }));
    server.handle("orchestration.dispatchCommand", (payload) => {
      const command = payload as Record<string, unknown>;
      dispatched.push(command);
      if (command["type"] === "thread.create") {
        shellThreads.push(
          makeShellThread({
            id: command["threadId"],
            projectId: command["projectId"],
            title: command["title"],
            runtimeMode: command["runtimeMode"],
          }),
        );
      }
      return { kind: "value", value: { sequence: dispatched.length } };
    });
  });
  afterEach(async () => {
    await connection.close();
    await server.close();
  });

  it("lists active threads, archived ones on request, and filters by project", async () => {
    expect((await threads.list()).map((t) => t.id)).toEqual(["thread-1"]);
    expect((await threads.list({ includeArchived: true })).map((t) => t.id)).toEqual([
      "thread-1",
      "thread-archived",
    ]);
    expect(
      (await threads.list({ includeArchived: true, projectId: projectId("project-2") })).map(
        (t) => t.id,
      ),
    ).toEqual(["thread-archived"]);
    expect(server.routes.requests[0]).toMatchObject({
      path: "/api/orchestration/shell",
      headers: protocolHeader,
    });
  });

  it("get prefers an active thread and falls back to the archive", async () => {
    expect(await threads.get(ids.threadId)).toMatchObject({ id: "thread-1" });
    expect(await threads.get(threadId("thread-archived"))).toMatchObject({ id: "thread-archived" });
    expect(await threads.get(threadId("missing"))).toBeUndefined();
  });

  it("reads detail and history over HTTP and the projection over RPC", async () => {
    server.routes.route(`GET /api/orchestration/threads/${ids.threadId}`, () => ({
      status: 200,
      body: makeSnapshot(makeProjection(), 3),
    }));
    server.routes.route(`GET /api/orchestration/threads/${ids.threadId}/history`, (request) => ({
      status: 200,
      body: {
        snapshotSequence: 3,
        items: [],
        nextCursor: request.query.get("cursor") === "c1" ? "c2" : null,
        hasMoreHistory: true,
      },
    }));
    server.respond("orchestration.getThreadProjection", makeProjection());

    const detail = await threads.detail(ids.threadId);
    expect(detail.snapshotSequence).toBe(3);
    expect(server.routes.requests.at(-1)).toMatchObject({
      path: `/api/orchestration/threads/${ids.threadId}`,
      headers: protocolHeader,
    });
    const page = await threads.historyPage(ids.threadId, "c1");
    expect(page).toMatchObject({ nextCursor: "c2", hasMoreHistory: true });
    expect(server.routes.requests.at(-1)).toMatchObject({
      path: `/api/orchestration/threads/${ids.threadId}/history`,
      headers: protocolHeader,
    });
    const projection = await threads.projection(ids.threadId);
    expect(projection.thread.id).toBe(ids.threadId);
    expect(server.lastConnection.received.at(-1)).toMatchObject({
      tag: "orchestration.getThreadProjection",
      payload: { threadId: ids.threadId },
    });
  });

  it("create dispatches thread.create with the defaults and returns the shell", async () => {
    const created = await threads.create({
      threadId: threadId("thread-2"),
      projectId: ids.projectId,
      title: "Second",
      modelSelection,
    });
    expect(dispatched[0]).toMatchObject({
      type: "thread.create",
      createdBy: "user",
      creationSource: "web",
      threadId: "thread-2",
      projectId: ids.projectId,
      title: "Second",
      runtimeMode: "full-access",
      interactionMode: "default",
      branch: null,
      worktreePath: null,
    });
    expect(created.id).toBe("thread-2");

    const generated = await threads.create({
      projectId: ids.projectId,
      title: "Third",
      modelSelection,
      runtimeMode: "auto",
      branch: "feature",
      origin: { createdBy: "agent", creationSource: "mcp" },
    });
    expect(dispatched[1]).toMatchObject({
      threadId: generated.id,
      runtimeMode: "auto",
      branch: "feature",
      createdBy: "agent",
      creationSource: "mcp",
    });
    expect(generated.id).not.toBe("thread-2");
  });

  it("ensure returns the existing thread untouched and creates a missing one once", async () => {
    const input = {
      threadId: ids.threadId,
      projectId: ids.projectId,
      title: "Other",
      modelSelection,
    };
    expect((await threads.ensure(input)).title).toBe("Sample thread");
    expect(dispatched).toEqual([]);
    const fresh = { ...input, threadId: threadId("thread-2") };
    await threads.ensure(fresh);
    await threads.ensure(fresh);
    expect(dispatched).toHaveLength(1);
  });

  it("launch calls orchestration.launchThread with a workspace strategy and a message id", async () => {
    let payload: Record<string, unknown> | undefined;
    server.handle("orchestration.launchThread", (input) => {
      payload = input as Record<string, unknown>;
      return {
        kind: "value",
        value: { threadId: ids.threadId, projection: makeProjection(), resumed: false },
      };
    });
    const result = await threads.launch({
      projectId: ids.projectId,
      title: "Launched",
      modelSelection,
      workspace: { type: "worktree", baseRef: "main" },
      initialMessage: { text: "Begin." },
      creationSource: "mcp",
    });
    expect(result).toMatchObject({ threadId: ids.threadId, resumed: false });
    expect(payload).toMatchObject({
      projectId: ids.projectId,
      title: "Launched",
      runtimeMode: "full-access",
      interactionMode: "default",
      workspaceStrategy: { type: "worktree", baseRef: "main" },
      initialMessage: { text: "Begin.", attachments: [] },
      creationSource: "mcp",
    });
    expect(payload).not.toHaveProperty("workspace");
    expect(typeof payload?.["commandId"]).toBe("string");
    const message = payload?.["initialMessage"] as Record<string, unknown>;
    expect(typeof message["messageId"]).toBe("string");
  });

  it("update dispatches thread.metadata.update with the patch", async () => {
    await threads.update(ids.threadId, { title: "Renamed", branch: null });
    expect(dispatched[0]).toMatchObject({
      type: "thread.metadata.update",
      threadId: ids.threadId,
      title: "Renamed",
      branch: null,
    });
  });

  it("dispatches the simple lifecycle and setting commands with fresh command ids", async () => {
    await threads.unarchive(ids.threadId);
    await threads.settle(ids.threadId);
    await threads.unsettle(ids.threadId);
    await threads.setRuntimeMode(ids.threadId, "approval-required");
    await threads.setInteractionMode(ids.threadId, "plan");
    await threads.setModelSelection(ids.threadId, modelSelection);
    expect(dispatched).toMatchObject([
      { type: "thread.unarchive", threadId: ids.threadId },
      { type: "thread.settle", threadId: ids.threadId },
      { type: "thread.unsettle", threadId: ids.threadId, reason: "user" },
      { type: "thread.runtime-mode.set", runtimeMode: "approval-required" },
      { type: "thread.interaction-mode.set", interactionMode: "plan" },
      { type: "thread.model-selection.set", modelSelection },
    ]);
    expect(new Set(dispatched.map((c) => c["commandId"])).size).toBe(6);
  });

  it("delete and archive resolve for a missing thread; archive tolerates already archived", async () => {
    server.handle("orchestration.dispatchCommand", () =>
      dispatchFailure("Thread 'missing' does not exist for command 'thread.delete'."),
    );
    await expect(threads.delete(threadId("missing"))).resolves.toBeUndefined();
    await expect(threads.archive(threadId("missing"))).resolves.toBeUndefined();
    server.handle("orchestration.dispatchCommand", () =>
      dispatchFailure(
        "Thread 'thread-1' is already archived and cannot handle command 'thread.archive'.",
      ),
    );
    await expect(threads.archive(ids.threadId)).resolves.toBeUndefined();
    await expect(threads.delete(ids.threadId)).rejects.toMatchObject({
      code: "rpc_failed",
      tag: "OrchestrationV2DispatchCommandError",
    });
    await expect(threads.unarchive(ids.threadId)).rejects.toMatchObject({ code: "rpc_failed" });
  });
});
