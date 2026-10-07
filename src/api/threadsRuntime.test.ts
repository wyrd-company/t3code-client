import { afterEach, beforeEach, describe, expect, it } from "vite-plus/test";
import { FakeT3Server } from "../../test/support/fakeServer.ts";
import {
  ids,
  items,
  makeProjection,
  makeRun,
  makeRuntimeRequest,
  makeShellThread,
} from "../../test/support/threadFixtures.ts";
import { RpcClient } from "../rpc/client.ts";
import { rpcMethods } from "../rpc/registry.ts";
import { runId, runtimeRequestId } from "../schemas/common.ts";
import type { OrchestrationV2ThreadProjection } from "../schemas/orchestration/projection.ts";
import { HttpTransport } from "../transport/http.ts";
import { RpcConnection } from "../transport/rpcConnection.ts";
import { SocketTransport } from "../transport/socket.ts";
import { CommandDispatcher } from "./dispatch.ts";
import { ThreadsApi } from "./threads.ts";

describe("ThreadsApi: runs and requests", () => {
  let server: FakeT3Server;
  let connection: RpcConnection;
  let threads: ThreadsApi;
  let projection: OrchestrationV2ThreadProjection;
  let dispatched: Record<string, unknown>[];
  let projectionReads: number;

  beforeEach(async () => {
    server = await FakeT3Server.start();
    projection = makeProjection();
    dispatched = [];
    projectionReads = 0;
    connection = new RpcConnection(new SocketTransport({ url: async () => server.wsUrl }));
    const rpc = new RpcClient(connection, rpcMethods);
    const http = new HttpTransport({
      baseUrl: server.httpUrl,
      fetch: server.fetch,
      getAccessToken: async () => "token-1",
    });
    threads = new ThreadsApi(http, rpc, new CommandDispatcher(rpc));
    server.handle("orchestration.getThreadProjection", () => {
      projectionReads += 1;
      return { kind: "value", value: projection };
    });
    server.handle("orchestration.dispatchCommand", (payload) => {
      dispatched.push(payload as Record<string, unknown>);
      return { kind: "value", value: { sequence: dispatched.length } };
    });
  });
  afterEach(async () => {
    await connection.close();
    await server.close();
  });

  it("interrupt targets the given run without reading the projection", async () => {
    await threads.interrupt(ids.threadId, runId("run-9"), { reason: "sample" });
    expect(projectionReads).toBe(0);
    expect(dispatched).toMatchObject([
      { type: "run.interrupt", threadId: ids.threadId, runId: "run-9", reason: "sample" },
    ]);
    expect(dispatched[0]).not.toHaveProperty("holdQueue");
  });

  it("interrupt resolves the active run from the projection when no run is given", async () => {
    projection = makeProjection({
      runs: [
        makeRun({ id: "run-1", status: "completed" }),
        makeRun({ id: "run-2", ordinal: 2, status: "running" }),
      ],
    });
    await threads.interrupt(ids.threadId);
    expect(projectionReads).toBe(1);
    expect(dispatched).toMatchObject([{ type: "run.interrupt", runId: "run-2" }]);
  });

  it("interrupt and stop are no-ops when nothing is active", async () => {
    projection = makeProjection({ runs: [makeRun({ status: "completed" })] });
    await threads.interrupt(ids.threadId);
    await threads.stop(ids.threadId);
    expect(projectionReads).toBe(2);
    expect(dispatched).toEqual([]);
  });

  it("stop interrupts the active run and holds the queue", async () => {
    projection = makeProjection({ runs: [makeRun({ status: "waiting" })] });
    await threads.stop(ids.threadId);
    expect(dispatched).toMatchObject([
      { type: "run.interrupt", threadId: ids.threadId, runId: ids.runId, holdQueue: true },
    ]);
  });

  it("answers approval and user-input requests and dismisses a question", async () => {
    await threads.respondToApproval({
      threadId: ids.threadId,
      requestId: runtimeRequestId("r1"),
      decision: "accept",
    });
    await threads.respondToUserInput({
      threadId: ids.threadId,
      requestId: runtimeRequestId("r2"),
      answers: { q1: "yes" },
    });
    await threads.respondToUserInput({
      threadId: ids.threadId,
      requestId: runtimeRequestId("r3"),
      answers: { q1: ["a", "b"] },
      attachmentsByQuestionId: { q1: [] },
    });
    await threads.dismissUserInput({ threadId: ids.threadId, requestId: runtimeRequestId("r3") });
    expect(dispatched).toMatchObject([
      { type: "runtime-request.respond", requestId: "r1", decision: "accept" },
      { type: "runtime-request.respond", requestId: "r2", answers: { q1: "yes" } },
      {
        type: "runtime-request.respond",
        requestId: "r3",
        answers: { q1: ["a", "b"] },
        attachmentsByQuestionId: { q1: [] },
      },
      { type: "thread.user-input.dismiss", requestId: "r3" },
    ]);
    expect(dispatched[0]).not.toHaveProperty("answers");
    expect(dispatched[1]).not.toHaveProperty("decision");
    expect(dispatched[1]).not.toHaveProperty("attachmentsByQuestionId");
    for (const command of dispatched) {
      expect(command["threadId"]).toBe(ids.threadId);
      expect(typeof command["commandId"]).toBe("string");
    }
    expect(new Set(dispatched.map((c) => c["commandId"])).size).toBe(4);
  });

  it("pendingRequests joins the projection's open requests with their timeline rows", async () => {
    projection = makeProjection({
      runtimeRequests: [
        makeRuntimeRequest("r1", { status: "resolved", resolvedAt: "2020-01-01T00:00:01.000Z" }),
        makeRuntimeRequest("r2", { kind: "user_input", createdAt: "2020-01-01T00:00:02.000Z" }),
        makeRuntimeRequest("r3", { createdAt: "2020-01-01T00:00:01.000Z" }),
      ],
      turnItems: [items.approvalRequest("r3"), items.userInputRequest("r2")],
    });
    const pending = await threads.pendingRequests(ids.threadId);
    expect(pending.map((r) => [r.kind, r.requestId])).toEqual([
      ["approval", "r3"],
      ["user-input", "r2"],
    ]);
    expect(pending[0]?.item).toMatchObject({ type: "approval_request", requestKind: "command" });
    expect(pending[1]?.kind === "user-input" && pending[1].questions[0]?.id).toBe("q1");
  });

  it("phase classifies a shell thread", () => {
    expect(threads.phase(makeShellThread())).toBe("idle");
    expect(threads.phase(makeShellThread({ status: "running" }))).toBe("running");
    expect(
      threads.phase(
        makeShellThread({
          status: "waiting",
          pendingRuntimeRequest: {
            id: "r1",
            kind: "user_input",
            createdAt: "2020-01-01T00:00:00.000Z",
          },
        }),
      ),
    ).toBe("waiting_for_input");
  });
});
