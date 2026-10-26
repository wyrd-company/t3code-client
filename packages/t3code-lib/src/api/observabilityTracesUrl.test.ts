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
  logsDirectoryPath: "/tmp/sample-logs",
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
const valid = [
  "https://example.invalid/v1/traces",
  "arbitrary text",
  "  sample  ",
  "x".repeat(4096),
];
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
it("types and trims optional trace URL metadata without URL-format or length restrictions", () => {
  expectTypeOf<ServerObservability["otlpTracesUrl"]>().toEqualTypeOf<string | undefined>();
  expectTypeOf<
    RpcSuccess<RpcMethods, "server.getConfig">["observability"]["otlpTracesUrl"]
  >().toEqualTypeOf<string | undefined>();
  expectTypeOf<
    Awaited<ReturnType<ServerApi["getConfig"]>>["observability"]["otlpTracesUrl"]
  >().toEqualTypeOf<string | undefined>();
  for (const value of valid) {
    expect(ServerObservability.parse({ ...observability, otlpTracesUrl: value })).toEqual({
      ...observability,
      otlpTracesUrl: value.trim(),
    });
  }
});
it("preserves trace URL omission and unknown observability metadata", () => {
  const parsed = ServerObservability.parse(observability);
  expect(parsed).toEqual(observability);
  expect(Object.hasOwn(parsed, "otlpTracesUrl")).toBe(false);
});
it("rejects malformed trace URL metadata with otherwise valid observability", () => {
  expect(ServerObservability.safeParse(observability).success).toBe(true);
  for (const otlpTracesUrl of invalid)
    expect(ServerObservability.safeParse({ ...observability, otlpTracesUrl }).success).toBe(false);
});
it("reads optional trimmed trace URL metadata and rejects malformed config reads", async () => {
  server.respond("server.getConfig", configFor({}));
  expect((await api.getConfig()).observability).toEqual(observability);
  for (const otlpTracesUrl of valid) {
    server.respond("server.getConfig", configFor({ otlpTracesUrl }));
    expect((await api.getConfig()).observability).toEqual({
      ...observability,
      otlpTracesUrl: otlpTracesUrl.trim(),
    });
  }
  for (const otlpTracesUrl of invalid) {
    server.respond("server.getConfig", configFor({ otlpTracesUrl }));
    await expect(api.getConfig()).rejects.toMatchObject({ code: "decode" });
  }
});
it("keeps later valid configuration snapshots after malformed trace URL chunks", async () => {
  const metadata = [
    ...invalid.map((otlpTracesUrl) => ({ otlpTracesUrl })),
    {},
    ...valid.map((otlpTracesUrl) => ({ otlpTracesUrl })),
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
      ...("otlpTracesUrl" in value ? { otlpTracesUrl: String(value["otlpTracesUrl"]).trim() } : {}),
    });
  }
});
