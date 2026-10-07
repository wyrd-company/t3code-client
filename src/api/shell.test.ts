import { afterEach, beforeEach, describe, expect, it } from "vite-plus/test";
import { FakeT3Server } from "../../test/support/fakeServer.ts";
import {
  makeShellProject,
  makeShellSnapshot,
  makeShellThread,
} from "../../test/support/threadFixtures.ts";
import { RpcClient } from "../rpc/client.ts";
import { rpcMethods } from "../rpc/registry.ts";
import { HttpTransport } from "../transport/http.ts";
import { RpcConnection } from "../transport/rpcConnection.ts";
import { SocketTransport } from "../transport/socket.ts";
import { ShellApi, type ArchivedShellWatchItem, type ShellWatchItem } from "./shell.ts";

const threadUpdated = (sequence: number, location = "active") => ({
  kind: "thread.updated",
  sequence,
  location,
  thread: makeShellThread(),
});
const archivedSnapshot = () => ({
  schemaVersion: 1,
  snapshotSequence: 3,
  projects: [makeShellProject()],
  threads: [makeShellThread({ id: "thread-archived", archivedAt: "2020-01-02T00:00:00.000Z" })],
});

describe("ShellApi", () => {
  let server: FakeT3Server;
  let connection: RpcConnection;
  let shell: ShellApi;

  beforeEach(async () => {
    server = await FakeT3Server.start();
    connection = new RpcConnection(
      new SocketTransport({
        url: async () => server.wsUrl,
        backoff: { initialMs: 10, factor: 1, maxMs: 10 },
      }),
    );
    const http = new HttpTransport({
      baseUrl: server.httpUrl,
      fetch: server.fetch,
      getAccessToken: async () => "token-1",
    });
    shell = new ShellApi(http, new RpcClient(connection, rpcMethods));
  });
  afterEach(async () => {
    await connection.close();
    await server.close();
  });

  it("reads the snapshot over HTTP with the protocol header", async () => {
    server.routes.route("GET /api/orchestration/shell", () => ({
      status: 200,
      body: makeShellSnapshot({
        projects: [makeShellProject()],
        archivedThreads: [makeShellThread({ id: "thread-archived" })],
        snapshotSequence: 4,
      }),
    }));
    const snapshot = await shell.snapshot();
    expect(snapshot.snapshotSequence).toBe(4);
    expect(snapshot.projects[0]?.id).toBe("project-1");
    expect(snapshot.archivedThreads.map((t) => t.id)).toEqual(["thread-archived"]);
    expect(server.routes.requests[0]).toMatchObject({
      method: "GET",
      path: "/api/orchestration/shell",
      headers: { "x-t3-orchestration-protocol": "2", authorization: "Bearer token-1" },
    });
  });

  it("reads the archived snapshot over RPC", async () => {
    const payloads: unknown[] = [];
    server.handle("orchestration.getArchivedShellSnapshot", (payload) => {
      payloads.push(payload);
      return { kind: "value", value: archivedSnapshot() };
    });
    const snapshot = await shell.archivedSnapshot();
    expect(payloads).toEqual([{}]);
    expect(snapshot.threads.map((t) => t.id)).toEqual(["thread-archived"]);
    expect(snapshot.projects).toHaveLength(1);
  });

  it("watches, resumes after a drop with afterSequence, and skips replayed items", async () => {
    const payloads: Record<string, unknown>[] = [];
    server.handle("orchestration.subscribeShell", (payload, context) => {
      payloads.push(payload as Record<string, unknown>);
      const send = (values: unknown[]) =>
        context.connection.send({ _tag: "Chunk", requestId: context.requestId, values });
      if (payloads.length === 1) {
        send([
          { kind: "snapshot", snapshot: makeShellSnapshot({ snapshotSequence: 5 }) },
          { kind: "synchronized" },
        ]);
        send([
          { kind: "project.updated", sequence: 6, project: makeShellProject() },
          threadUpdated(7),
          { kind: "something-new", sequence: 8 },
        ]);
        return { kind: "hang" };
      }
      return {
        kind: "stream",
        chunks: [
          [threadUpdated(7)],
          [{ kind: "synchronized" }],
          [{ kind: "thread.removed", sequence: 9, location: "archive", threadId: "thread-1" }],
          [{ kind: "project.removed", sequence: 10, projectId: "project-1" }],
        ],
      };
    });
    const items: ShellWatchItem[] = [];
    for await (const item of shell.watch()) {
      items.push(item);
      if (item.kind === "thread.updated" && payloads.length === 1) server.connections[0]?.drop();
    }
    expect(payloads[0]).toEqual({ requestCompletionMarker: true });
    expect(payloads[1]).toEqual({ requestCompletionMarker: true, afterSequence: 7 });
    expect(items.map((i) => i.kind)).toEqual([
      "snapshot",
      "synchronized",
      "project.updated",
      "thread.updated",
      "reconnected",
      "synchronized",
      "thread.removed",
      "project.removed",
    ]);
    expect(items[3]).toMatchObject({ kind: "thread.updated", location: "active" });
    expect(items[4]).toEqual({ kind: "reconnected", afterSequence: 7 });
    expect(items[6]).toMatchObject({ location: "archive", threadId: "thread-1" });
  });

  it("starts from a given afterSequence and drops items at or below it", async () => {
    let payload: unknown;
    server.handle("orchestration.subscribeShell", (input) => {
      payload = input;
      return {
        kind: "stream",
        chunks: [[threadUpdated(11), threadUpdated(12), threadUpdated(13)]],
      };
    });
    const sequences: number[] = [];
    for await (const item of shell.watch({ afterSequence: 12 })) {
      if (item.kind === "thread.updated") sequences.push(item.sequence);
    }
    expect(payload).toMatchObject({ afterSequence: 12 });
    expect(sequences).toEqual([13]);
  });

  it("watchArchived passes known items through and ends with the stream", async () => {
    server.handle("orchestration.subscribeArchivedShell", () => ({
      kind: "stream",
      chunks: [
        [{ kind: "snapshot", snapshot: archivedSnapshot() }],
        [
          {
            kind: "thread.updated",
            sequence: 4,
            thread: makeShellThread({ id: "thread-archived" }),
          },
        ],
        [{ kind: "something-new", sequence: 5 }],
        [{ kind: "thread.removed", sequence: 6, threadId: "thread-archived" }],
      ],
    }));
    const items: ArchivedShellWatchItem[] = [];
    for await (const item of shell.watchArchived()) items.push(item);
    expect(items.map((i) => i.kind)).toEqual(["snapshot", "thread.updated", "thread.removed"]);
    expect(items[0]?.kind === "snapshot" && items[0].snapshot.threads[0]?.id).toBe(
      "thread-archived",
    );
  });

  it("returns silently on abort", async () => {
    server.handle("orchestration.subscribeShell", (_payload, context) => {
      context.connection.send({
        _tag: "Chunk",
        requestId: context.requestId,
        values: [{ kind: "snapshot", snapshot: makeShellSnapshot({}) }],
      });
      return { kind: "hang" };
    });
    const controller = new AbortController();
    const kinds: string[] = [];
    for await (const item of shell.watch({ signal: controller.signal })) {
      kinds.push(item.kind);
      controller.abort();
    }
    expect(kinds).toEqual(["snapshot"]);
  });
});
