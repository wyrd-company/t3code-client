// ---
// relationships:
//   verifies: library-facades
// ---
import { afterEach, beforeEach, describe, expect, expectTypeOf, it } from "vite-plus/test";
import { FakeT3Server } from "../../test/support/fakeServer.ts";
import { T3DecodeError, T3InterruptedError, T3PreconditionError, T3RpcError } from "../errors.ts";
import type { T3Client } from "../index.ts";
import { RpcClient } from "../rpc/client.ts";
import { rpcMethods, type RpcMethods } from "../rpc/registry.ts";
import type { RpcPayload, RpcSuccess } from "../rpc/spec.ts";
import type {
  ProjectListIgnoredFilesInput,
  ProjectListIgnoredFilesResult,
} from "../schemas/projects.ts";
import { HttpTransport } from "../transport/http.ts";
import { RpcConnection } from "../transport/rpcConnection.ts";
import { SocketTransport } from "../transport/socket.ts";
import { CommandDispatcher } from "./dispatch.ts";
import { ProjectsApi } from "./projects.ts";

const METHOD = "projects.listIgnoredFiles";
const until = async (check: () => boolean, ms = 3_000): Promise<void> => {
  const deadline = Date.now() + ms;
  while (!check()) {
    if (Date.now() > deadline) throw new Error("condition not met");
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
};

describe("projects.listIgnoredFiles through rpc.call and projects.files.listIgnored", () => {
  let server: FakeT3Server;
  let connection: RpcConnection;
  let rpc: RpcClient<RpcMethods>;
  let projects: ProjectsApi;
  let received: unknown[];

  beforeEach(async () => {
    server = await FakeT3Server.start();
    received = [];
    connection = new RpcConnection(new SocketTransport({ url: async () => server.wsUrl }));
    rpc = new RpcClient(connection, rpcMethods);
    projects = new ProjectsApi(
      new HttpTransport({
        baseUrl: server.httpUrl,
        fetch: server.fetch,
        getAccessToken: async () => "sample-token",
      }),
      rpc,
      new CommandDispatcher(rpc),
    );
    server.handle(METHOD, (payload) => {
      received.push(payload);
      return {
        kind: "value",
        value: {
          files: [
            { path: "sample.env", byteLength: 12, future: "kept" },
            { path: "", byteLength: 1 },
            { path: "nested/build.log", byteLength: 30 },
          ],
          truncated: false,
          next: "kept",
        },
      };
    });
  });
  afterEach(async () => {
    await connection.close();
    await server.close();
  });

  const attempts = (input: ProjectListIgnoredFilesInput, signal?: AbortSignal) => [
    () => projects.files.listIgnored(input, signal),
    () => rpc.call(METHOD, input, signal),
  ];

  it("types the method and the public facade member", () => {
    expectTypeOf<
      RpcPayload<RpcMethods, typeof METHOD>
    >().toEqualTypeOf<ProjectListIgnoredFilesInput>();
    expectTypeOf<
      RpcSuccess<RpcMethods, typeof METHOD>
    >().toEqualTypeOf<ProjectListIgnoredFilesResult>();
    expectTypeOf<Parameters<T3Client["projects"]["files"]["listIgnored"]>>().toEqualTypeOf<
      [ProjectListIgnoredFilesInput, (AbortSignal | undefined)?]
    >();
    expectTypeOf<
      Awaited<ReturnType<T3Client["projects"]["files"]["listIgnored"]>>
    >().toEqualTypeOf<ProjectListIgnoredFilesResult>();
  });

  it("sends the trimmed input with metadata and decodes the result on both paths", async () => {
    for (const attempt of attempts({ cwd: " /srv/sample ", future: 1 })) {
      expect(await attempt()).toEqual({
        files: [
          { path: "sample.env", byteLength: 12, future: "kept" },
          { path: "nested/build.log", byteLength: 30 },
        ],
        truncated: false,
        next: "kept",
      });
    }
    expect(received).toEqual([
      { cwd: "/srv/sample", future: 1 },
      { cwd: "/srv/sample", future: 1 },
    ]);
    const requests = server.lastConnection.received.filter((e) => e["_tag"] === "Request");
    expect(requests.map((e) => e["tag"])).toEqual([METHOD, METHOD]);
  });

  it("rejects an invalid cwd before sending on both paths", async () => {
    for (const cwd of ["", "  "]) {
      for (const attempt of attempts({ cwd })) {
        await expect(attempt(), cwd).rejects.toBeInstanceOf(T3PreconditionError);
      }
    }
    expect(received).toEqual([]);
    const requests = server.connections.flatMap((c) => c.received);
    expect(requests.filter((e) => e["_tag"] === "Request")).toEqual([]);
  });

  it("rejects a malformed result on both paths", async () => {
    server.handle(METHOD, () => ({ kind: "value", value: { files: [], truncated: "no" } }));
    for (const attempt of attempts({ cwd: "/srv/sample" })) {
      await expect(attempt()).rejects.toBeInstanceOf(T3DecodeError);
    }
  });

  it("surfaces the typed ProjectListEntriesError on both paths", async () => {
    server.handle(METHOD, () => ({
      kind: "fail",
      error: {
        _tag: "ProjectListEntriesError",
        cwd: "/srv/missing",
        failure: "workspace_root_not_found",
        message: "Workspace root does not exist.",
      },
    }));
    for (const attempt of attempts({ cwd: "/srv/missing" })) {
      const error = await attempt().catch((caught: unknown) => caught);
      expect(error).toBeInstanceOf(T3RpcError);
      expect(error).toMatchObject({ code: "rpc_failed", tag: "ProjectListEntriesError" });
      if (error instanceof T3RpcError && error.is("ProjectListEntriesError")) {
        expect(error.record.failure).toBe("workspace_root_not_found");
      } else {
        throw new Error("expected a recognised ProjectListEntriesError record");
      }
    }
  });

  it("forwards the caller's abort signal on both paths", async () => {
    server.handle(METHOD, (payload) => {
      received.push(payload);
      return { kind: "hang" };
    });
    let count = 0;
    for (const attempt of [
      (signal: AbortSignal) => projects.files.listIgnored({ cwd: "/srv/sample" }, signal),
      (signal: AbortSignal) => rpc.call(METHOD, { cwd: "/srv/sample" }, signal),
    ]) {
      const controller = new AbortController();
      const pending = attempt(controller.signal);
      count += 1;
      await until(() => received.length === count);
      controller.abort();
      await expect(pending).rejects.toBeInstanceOf(T3InterruptedError);
    }
    await until(() => server.lastConnection.interrupts.length === 2);
  });
});
