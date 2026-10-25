// ---
// relationships:
//   verifies: library-wire
// ---
import { afterEach, beforeEach, expect, expectTypeOf, it } from "vite-plus/test";
import { FakeT3Server } from "../../test/support/fakeServer.ts";
import {
  ids,
  at,
  makeAppThread,
  makeProjection,
  makeShellThread,
  eventItem,
} from "../../test/support/threadFixtures.ts";
import { RpcClient } from "../rpc/client.ts";
import { rpcMethods } from "../rpc/registry.ts";
import { HttpTransport } from "../transport/http.ts";
import { RpcConnection } from "../transport/rpcConnection.ts";
import { SocketTransport } from "../transport/socket.ts";
import { PullRequestActor } from "../schemas/orchestration/pullRequest.ts";
import { CommandDispatcher } from "./dispatch.ts";
import { ThreadsApi } from "./threads.ts";
import { ShellApi } from "./shell.ts";
import { T3DecodeError } from "../errors.ts";

const actor = (metadata: Record<string, unknown> = {}) => ({
  login: "sample-author",
  name: null,
  avatarUrl: null,
  futureActor: "preserved",
  ...metadata,
});
const valid = [{}, { isBot: true }, { isBot: false }];
const malformed = [null, 0, 1, "true", "false", "", [], {}];
const link = (authorMetadata: Record<string, unknown> = {}) => ({
  host: "example.invalid",
  repository: "sample/repository",
  number: 1,
  url: "https://example.invalid/sample/repository/pull/1",
  source: "manual",
  linkedAt: at,
  snapshot: {
    state: "open",
    title: "Sample change",
    headBranch: "sample-head",
    baseBranch: "sample-base",
    isDraft: false,
    updatedAt: at,
    syncedAt: at,
    futureSnapshot: true,
    ...authorMetadata,
  },
  stack: null,
  futureLink: true,
});
const projection = (value: ReturnType<typeof link>) => ({
  ...makeProjection(),
  thread: makeAppThread({ pullRequests: [value] }),
});
const shellThread = (value: ReturnType<typeof link>) => ({
  ...makeShellThread(),
  pullRequests: [value],
});
const shellSnapshot = (value: ReturnType<typeof link>, sequence = 1) => ({
  schemaVersion: 1,
  snapshotSequence: sequence,
  projects: [],
  threads: [shellThread(value)],
  archivedThreads: [],
});
let server: FakeT3Server;
let threads: ThreadsApi;
let shell: ShellApi;
let connection: RpcConnection;
beforeEach(async () => {
  server = await FakeT3Server.start();
  connection = new RpcConnection(new SocketTransport({ url: async () => server.wsUrl }));
  const rpc = new RpcClient(connection, rpcMethods);
  const http = new HttpTransport({
    baseUrl: server.httpUrl,
    fetch: server.fetch,
    getAccessToken: async () => "sample-token",
  });
  threads = new ThreadsApi(http, rpc, new CommandDispatcher(rpc));
  shell = new ShellApi(http, rpc);
});
afterEach(async () => {
  await connection.close();
  await server.close();
});

it("types actor isBot and preserves true, false, omission and unknown metadata", () => {
  for (const metadata of valid) {
    const parsed = PullRequestActor.parse(actor(metadata));
    expectTypeOf(parsed.isBot).toEqualTypeOf<boolean | undefined>();
    expect(parsed).toEqual(actor(metadata));
    expect(Object.hasOwn(parsed, "isBot")).toBe(Object.hasOwn(metadata, "isBot"));
  }
});
it("rejects malformed isBot on an otherwise valid actor", () => {
  expect(PullRequestActor.safeParse(actor()).success).toBe(true);
  for (const isBot of malformed)
    expect(PullRequestActor.safeParse(actor({ isBot })).success).toBe(false);
});
it("reads actor metadata and preserves absent or null authors over public HTTP and RPC", async () => {
  for (const authorMetadata of [
    {},
    { author: null },
    ...valid.map((m) => ({ author: actor(m) })),
  ]) {
    const value = link(authorMetadata);
    const state = projection(value);
    server.respond("orchestration.getThreadProjection", state);
    server.routes.route(`GET /api/orchestration/threads/${ids.threadId}`, () => ({
      status: 200,
      body: { snapshotSequence: 1, projection: state },
    }));
    server.routes.route("GET /api/orchestration/shell", () => ({
      status: 200,
      body: shellSnapshot(value),
    }));
    for (const thread of [
      (await threads.projection(ids.threadId)).thread,
      (await threads.detail(ids.threadId)).projection.thread,
      (await shell.snapshot()).threads[0]!,
    ]) {
      const read = thread.pullRequests![0]!;
      expectTypeOf(read.snapshot!.author?.isBot).toEqualTypeOf<boolean | undefined>();
      expect(read).toEqual(value);
      expect(Object.hasOwn(read.snapshot!, "author")).toBe(Object.hasOwn(authorMetadata, "author"));
      const expectedAuthor = "author" in authorMetadata ? authorMetadata.author : undefined;
      expect(Object.hasOwn(read.snapshot?.author ?? {}, "isBot")).toBe(
        Object.hasOwn(expectedAuthor ?? {}, "isBot"),
      );
    }
  }
});
it("rejects malformed actor metadata through all public read containers", async () => {
  for (const isBot of malformed) {
    const value = link({ author: actor({ isBot }) });
    server.respond("orchestration.getThreadProjection", projection(value));
    server.routes.route(`GET /api/orchestration/threads/${ids.threadId}`, () => ({
      status: 200,
      body: { snapshotSequence: 1, projection: projection(value) },
    }));
    server.routes.route("GET /api/orchestration/shell", () => ({
      status: 200,
      body: shellSnapshot(value),
    }));
    await expect(threads.projection(ids.threadId)).rejects.toBeInstanceOf(T3DecodeError);
    await expect(threads.detail(ids.threadId)).rejects.toBeInstanceOf(T3DecodeError);
    await expect(shell.snapshot()).rejects.toBeInstanceOf(T3DecodeError);
  }
});
it("reports malformed thread snapshots and link events then preserves later valid actors", async () => {
  let sequence = 1;
  const snapshot = (value: ReturnType<typeof link>) => ({
    kind: "snapshot",
    snapshotSequence: sequence++,
    projection: projection(value),
  });
  const chunks = [
    ...malformed.map((isBot) => [snapshot(link({ author: actor({ isBot }) }))]),
    ...valid.map((m) => [snapshot(link({ author: actor(m) }))]),
    ...malformed.map((isBot) => [
      eventItem(sequence++, "thread.pull-request-link-updated", link({ author: actor({ isBot }) })),
    ]),
    ...valid.map((m) => [
      eventItem(sequence++, "thread.pull-request-link-updated", link({ author: actor(m) })),
    ]),
  ];
  server.handle("orchestration.subscribeThread", () => ({ kind: "stream", chunks }));
  const seen = [];
  for await (const item of threads.watch(ids.threadId)) seen.push(item);
  expect(seen.map((item) => item.kind)).toEqual([
    ...malformed.map(() => "decode-error"),
    ...valid.map(() => "snapshot"),
    ...malformed.map(() => "decode-error"),
    ...valid.map(() => "event"),
  ]);
  const snapshots = seen.filter((item) => item.kind === "snapshot");
  const updates = seen.filter((item) => item.kind === "event");
  for (let i = 0; i < valid.length; i++) {
    const event = updates[i]?.event;
    if (!event || "unknown" in event || event.type !== "thread.pull-request-link-updated")
      throw new Error("Expected link update");
    expectTypeOf(event.payload.snapshot!.author?.isBot).toEqualTypeOf<boolean | undefined>();
    expect(event.payload).toEqual(link({ author: actor(valid[i]!) }));
    expect(snapshots[i]!.snapshot.projection.thread.pullRequests?.[0]).toEqual(event.payload);
  }
});
it("reports malformed shell snapshots and updates then preserves later valid actors", async () => {
  let sequence = 1;
  const snapshot = (value: ReturnType<typeof link>) => ({
    kind: "snapshot",
    snapshot: shellSnapshot(value, sequence++),
  });
  const update = (value: ReturnType<typeof link>) => ({
    kind: "thread.updated",
    sequence: sequence++,
    location: "active",
    thread: shellThread(value),
  });
  const chunks = [
    ...malformed.map((isBot) => [snapshot(link({ author: actor({ isBot }) }))]),
    ...valid.map((m) => [snapshot(link({ author: actor(m) }))]),
    ...malformed.map((isBot) => [update(link({ author: actor({ isBot }) }))]),
    ...valid.map((m) => [update(link({ author: actor(m) }))]),
  ];
  server.handle("orchestration.subscribeShell", () => ({ kind: "stream", chunks }));
  const seen = [];
  for await (const item of shell.watch()) seen.push(item);
  expect(seen.map((item) => item.kind)).toEqual([
    ...malformed.map(() => "decode-error"),
    ...valid.map(() => "snapshot"),
    ...malformed.map(() => "decode-error"),
    ...valid.map(() => "thread.updated"),
  ]);
  const snapshots = seen.filter((item) => item.kind === "snapshot");
  const updates = seen.filter((item) => item.kind === "thread.updated");
  for (let i = 0; i < valid.length; i++) {
    expect(updates[i]!.thread.pullRequests?.[0]).toEqual(link({ author: actor(valid[i]!) }));
    expect(snapshots[i]!.snapshot.threads[0]!.pullRequests).toEqual(
      updates[i]!.thread.pullRequests,
    );
  }
});
