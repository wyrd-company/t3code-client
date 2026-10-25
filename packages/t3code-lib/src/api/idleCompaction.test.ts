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
import { ServerConfigStreamEvent, ServerSettings } from "../schemas/server.ts";
import { HttpTransport } from "../transport/http.ts";
import { RpcConnection } from "../transport/rpcConnection.ts";
import { SocketTransport } from "../transport/socket.ts";
import { ServerApi } from "./server.ts";

const config: Record<string, unknown> = JSON.parse(
  NodeFS.readFileSync(new URL("../../test/fixtures/server-config.json", import.meta.url), "utf8"),
);
const settings = { future: { retained: true } };
const configFor = (metadata: Record<string, unknown>) => ({
  ...config,
  settings: { ...settings, ...metadata },
});
const valid = [
  "onReturn",
  "beforeCacheExpires",
  "off",
  "future-mode",
  "",
  "  sample  ",
  "x".repeat(4096),
];
const invalid = [null, true, 12, {}, []];
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
it("types optional idle compaction modes and preserves growing strings", () => {
  expectTypeOf<ServerSettings["idleCompaction"]>().toEqualTypeOf<
    import("../schemas/common.ts").KnownOr<"onReturn" | "beforeCacheExpires" | "off"> | undefined
  >();
  expectTypeOf<
    RpcSuccess<RpcMethods, "server.getConfig">["settings"]["idleCompaction"]
  >().toEqualTypeOf<
    import("../schemas/common.ts").KnownOr<"onReturn" | "beforeCacheExpires" | "off"> | undefined
  >();
  expectTypeOf<
    Awaited<ReturnType<ServerApi["getConfig"]>>["settings"]["idleCompaction"]
  >().toEqualTypeOf<
    import("../schemas/common.ts").KnownOr<"onReturn" | "beforeCacheExpires" | "off"> | undefined
  >();
  for (const value of valid) {
    expect(ServerSettings.parse({ ...settings, idleCompaction: value })).toEqual({
      ...settings,
      idleCompaction: value,
    });
  }
});
it("preserves idle compaction mode omission and unknown settings metadata", () => {
  const parsed = ServerSettings.parse(settings);
  expect(parsed).toEqual(settings);
  expect(Object.hasOwn(parsed, "idleCompaction")).toBe(false);
});
it("rejects malformed idle compaction mode metadata with otherwise valid settings", () => {
  expect(ServerSettings.safeParse(settings).success).toBe(true);
  for (const idleCompaction of invalid)
    expect(ServerSettings.safeParse({ ...settings, idleCompaction }).success).toBe(false);
});
it("reads optional idle compaction mode metadata and rejects malformed config reads", async () => {
  server.respond("server.getConfig", configFor({}));
  expect((await api.getConfig()).settings).toEqual(settings);
  for (const idleCompaction of valid) {
    server.respond("server.getConfig", configFor({ idleCompaction }));
    expect((await api.getConfig()).settings).toEqual({
      ...settings,
      idleCompaction: idleCompaction,
    });
  }
  for (const idleCompaction of invalid) {
    server.respond("server.getConfig", configFor({ idleCompaction }));
    await expect(api.getConfig()).rejects.toMatchObject({ code: "decode" });
  }
});
it("keeps later valid configuration snapshots after malformed idle compaction mode chunks", async () => {
  const metadata = [
    ...invalid.map((idleCompaction) => ({ idleCompaction })),
    {},
    ...valid.map((idleCompaction) => ({ idleCompaction })),
  ];
  server.handle("subscribeServerConfig", () => ({
    kind: "stream",
    chunks: metadata.flatMap((value) => [
      [{ version: 1, type: "snapshot", config: configFor(value) }],
      [{ version: 1, type: "settingsUpdated", payload: { settings: { ...settings, ...value } } }],
    ]),
  }));
  const seen = [];
  for await (const item of api.watchConfig()) seen.push(item);
  expect(seen).toHaveLength(metadata.length * 2);
  for (let i = 0; i < invalid.length * 2; i++)
    expect(seen[i]).toMatchObject({ kind: "decode-error", error: { code: "decode" } });
  for (let i = invalid.length * 2; i < seen.length; i++) {
    const event = ServerConfigStreamEvent.parse(seen[i]);
    if ("unknown" in event || (event.type !== "snapshot" && event.type !== "settingsUpdated"))
      throw new Error("Expected snapshot");
    const value = metadata[Math.floor(i / 2)] as Record<string, unknown>;
    expect(event.type === "snapshot" ? event.config.settings : event.payload.settings).toEqual({
      ...settings,
      ...("idleCompaction" in value ? { idleCompaction: String(value["idleCompaction"]) } : {}),
    });
  }
});
