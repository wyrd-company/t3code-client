// ---
// relationships:
//   verifies: library-facades
// ---
import * as NodeFS from "node:fs";
import { afterEach, beforeEach, expect, expectTypeOf, it } from "vite-plus/test";
import { FakeT3Server } from "../../test/support/fakeServer.ts";
import { RpcClient } from "../rpc/client.ts";
import { rpcMethods, type RpcMethods } from "../rpc/registry.ts";
import type { RpcSuccess } from "../rpc/spec.ts";
import { ServerConfigStreamEvent, ServerObservability } from "../schemas/server.ts";
import { HttpTransport } from "../transport/http.ts";
import { RpcConnection } from "../transport/rpcConnection.ts";
import { SocketTransport } from "../transport/socket.ts";
import { ServerApi } from "./server.ts";

const config: Record<string, unknown> = JSON.parse(
  NodeFS.readFileSync(new URL("../../test/fixtures/server-config.json", import.meta.url), "utf8"),
);
const observability = {
  localTracingEnabled: true,
  otlpTracesEnabled: false,
  otlpMetricsEnabled: false,
  otlpLogsEnabled: false,
  future: { retained: true },
};
const configFor = (metadata: Record<string, unknown>) => ({
  ...config,
  observability: { ...observability, ...metadata },
});
const valid = ["/tmp/sample-logs", "relative text", "  /tmp/sample padded  ", "x".repeat(4096)];
const invalid = [null, "", " \t\n", true, 12, {}, []];
let server: FakeT3Server;
let connection: RpcConnection;
let api: ServerApi;
beforeEach(async () => {
  server = await FakeT3Server.start();
  connection = new RpcConnection(new SocketTransport({ url: async () => server.wsUrl }));
  api = new ServerApi(
    new RpcClient(connection, rpcMethods),
    new HttpTransport({ baseUrl: server.httpUrl, getAccessToken: async () => undefined }),
  );
});
afterEach(async () => {
  await connection.close();
  await server.close();
});
it("types and trims optional logs directory metadata without path-format or length restrictions", () => {
  expectTypeOf<ServerObservability["logsDirectoryPath"]>().toEqualTypeOf<string | undefined>();
  expectTypeOf<
    RpcSuccess<RpcMethods, "server.getConfig">["observability"]["logsDirectoryPath"]
  >().toEqualTypeOf<string | undefined>();
  expectTypeOf<
    Awaited<ReturnType<ServerApi["getConfig"]>>["observability"]["logsDirectoryPath"]
  >().toEqualTypeOf<string | undefined>();
  for (const value of valid) {
    expect(ServerObservability.parse({ ...observability, logsDirectoryPath: value })).toEqual({
      ...observability,
      logsDirectoryPath: value.trim(),
    });
  }
});
it("preserves logs directory omission and unknown observability metadata", () => {
  const parsed = ServerObservability.parse(observability);
  expect(parsed).toEqual(observability);
  expect(Object.hasOwn(parsed, "logsDirectoryPath")).toBe(false);
});
it("rejects malformed logs directory metadata with otherwise valid observability", () => {
  expect(ServerObservability.safeParse(observability).success).toBe(true);
  for (const logsDirectoryPath of invalid)
    expect(ServerObservability.safeParse({ ...observability, logsDirectoryPath }).success).toBe(
      false,
    );
});
it("reads optional trimmed logs directory metadata and rejects malformed config reads", async () => {
  server.respond("server.getConfig", configFor({}));
  expect((await api.getConfig()).observability).toEqual(observability);
  for (const logsDirectoryPath of valid) {
    server.respond("server.getConfig", configFor({ logsDirectoryPath }));
    expect((await api.getConfig()).observability).toEqual({
      ...observability,
      logsDirectoryPath: logsDirectoryPath.trim(),
    });
  }
  for (const logsDirectoryPath of invalid) {
    server.respond("server.getConfig", configFor({ logsDirectoryPath }));
    await expect(api.getConfig()).rejects.toMatchObject({ code: "decode" });
  }
});
it("keeps later valid configuration snapshots after malformed logs directory chunks", async () => {
  const metadata = [
    ...invalid.map((logsDirectoryPath) => ({ logsDirectoryPath })),
    {},
    ...valid.map((logsDirectoryPath) => ({ logsDirectoryPath })),
  ];
  server.handle("subscribeServerConfig", () => ({
    kind: "stream",
    chunks: metadata.map((value) => [{ version: 1, type: "snapshot", config: configFor(value) }]),
  }));
  const seen = [];
  for await (const item of api.watchConfig()) seen.push(item);
  expect(seen).toHaveLength(metadata.length);
  for (let i = 0; i < invalid.length; i++)
    expect(seen[i]).toMatchObject({ kind: "decode-error", error: { code: "decode" } });
  for (let i = invalid.length; i < seen.length; i++) {
    const event = ServerConfigStreamEvent.parse(seen[i]);
    if ("unknown" in event || event.type !== "snapshot") throw new Error("Expected snapshot");
    const value = metadata[i] as Record<string, unknown>;
    expect(event.config.observability).toEqual({
      ...observability,
      ...("logsDirectoryPath" in value
        ? { logsDirectoryPath: String(value["logsDirectoryPath"]).trim() }
        : {}),
    });
  }
});
