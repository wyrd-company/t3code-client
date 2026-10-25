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
const observability = { future: { retained: true } };
const configFor = (metadata: Record<string, unknown>) => ({
  ...config,
  observability: { ...observability, ...metadata },
});
const valid = [true, false];
const invalid = [null, "false", "", 12, {}, []];
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
it("types optional local tracing flags and preserves false", () => {
  expectTypeOf<ServerObservability["localTracingEnabled"]>().toEqualTypeOf<boolean | undefined>();
  expectTypeOf<
    RpcSuccess<RpcMethods, "server.getConfig">["observability"]["localTracingEnabled"]
  >().toEqualTypeOf<boolean | undefined>();
  expectTypeOf<
    Awaited<ReturnType<ServerApi["getConfig"]>>["observability"]["localTracingEnabled"]
  >().toEqualTypeOf<boolean | undefined>();
  for (const value of valid) {
    expect(ServerObservability.parse({ ...observability, localTracingEnabled: value })).toEqual({
      ...observability,
      localTracingEnabled: value,
    });
  }
});
it("preserves local tracing flag omission and unknown observability metadata", () => {
  const parsed = ServerObservability.parse(observability);
  expect(parsed).toEqual(observability);
  expect(Object.hasOwn(parsed, "localTracingEnabled")).toBe(false);
});
it("rejects malformed local tracing flag metadata with otherwise valid observability", () => {
  expect(ServerObservability.safeParse(observability).success).toBe(true);
  for (const localTracingEnabled of invalid)
    expect(ServerObservability.safeParse({ ...observability, localTracingEnabled }).success).toBe(
      false,
    );
});
it("reads optional local tracing flag metadata and rejects malformed config reads", async () => {
  server.respond("server.getConfig", configFor({}));
  expect((await api.getConfig()).observability).toEqual(observability);
  for (const localTracingEnabled of valid) {
    server.respond("server.getConfig", configFor({ localTracingEnabled }));
    expect((await api.getConfig()).observability).toEqual({
      ...observability,
      localTracingEnabled: localTracingEnabled,
    });
  }
  for (const localTracingEnabled of invalid) {
    server.respond("server.getConfig", configFor({ localTracingEnabled }));
    await expect(api.getConfig()).rejects.toMatchObject({ code: "decode" });
  }
});
it("keeps later valid configuration snapshots after malformed local tracing flag chunks", async () => {
  const metadata = [
    ...invalid.map((localTracingEnabled) => ({ localTracingEnabled })),
    {},
    ...valid.map((localTracingEnabled) => ({ localTracingEnabled })),
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
      ...("localTracingEnabled" in value
        ? { localTracingEnabled: value["localTracingEnabled"] }
        : {}),
    });
  }
});
