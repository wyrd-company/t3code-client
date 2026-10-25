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
import { ServerProvider } from "../schemas/provider.ts";
import { ServerConfigStreamEvent } from "../schemas/server.ts";
import { HttpTransport } from "../transport/http.ts";
import { RpcConnection } from "../transport/rpcConnection.ts";
import { SocketTransport } from "../transport/socket.ts";
import { ServerApi } from "./server.ts";
const provider = (metadata: Record<string, unknown>) => ({
  instanceId: "sample",
  driver: "codex",
  enabled: false,
  installed: false,
  version: null,
  status: "disabled",
  auth: { status: "unknown" },
  checkedAt: "2026-01-01T00:00:00.000Z",
  models: [],
  slashCommands: [],
  skills: [],
  future: true,
  ...metadata,
});
const valid = [
  {},
  { iconUrl: "https://example.invalid/icon.svg" },
  { iconUrl: "  sample  " },
  { iconUrl: "x".repeat(2048) },
];
const invalid = [null, false, 1, {}, [], "", "  ", "x".repeat(2049)];
const normalized = (metadata: Record<string, unknown>) =>
  typeof metadata["iconUrl"] === "string"
    ? provider({ ...metadata, iconUrl: metadata["iconUrl"].trim() })
    : provider(metadata);
const config: Record<string, unknown> = JSON.parse(
  NodeFS.readFileSync(new URL("../../test/fixtures/server-config.json", import.meta.url), "utf8"),
);
const configFor = (metadata: Record<string, unknown>) => ({
  ...config,
  providers: [provider(metadata)],
});
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
it("types and normalizes optional icon metadata without narrowing it to URLs", () => {
  expectTypeOf<ServerProvider["iconUrl"]>().toEqualTypeOf<string | undefined>();
  expectTypeOf<
    RpcSuccess<RpcMethods, "server.getConfig">["providers"][number]["iconUrl"]
  >().toEqualTypeOf<string | undefined>();
  expectTypeOf<Awaited<ReturnType<ServerApi["providers"]>>[number]["iconUrl"]>().toEqualTypeOf<
    string | undefined
  >();
  for (const metadata of valid) {
    const parsed = ServerProvider.parse(provider(metadata));
    expect(parsed).toEqual(normalized(metadata));
    expect(Object.hasOwn(parsed, "iconUrl")).toBe(Object.hasOwn(metadata, "iconUrl"));
  }
});
it("rejects malformed icons on otherwise valid provider records", () => {
  expect(ServerProvider.safeParse(provider({})).success).toBe(true);
  for (const iconUrl of invalid)
    expect(ServerProvider.safeParse(provider({ iconUrl })).success).toBe(false);
});
it("reads typed icons and omission through existing config and provider reads", async () => {
  for (const metadata of valid) {
    server.respond("server.getConfig", configFor(metadata));
    expect((await api.getConfig()).providers).toEqual([normalized(metadata)]);
    expect(await api.providers()).toEqual([normalized(metadata)]);
  }
});
it("omits malformed provider records through existing config reads", async () => {
  for (const iconUrl of invalid) {
    server.respond("server.getConfig", configFor({ iconUrl }));
    expect((await api.getConfig()).providers).toEqual([]);
  }
});
it("keeps later valid provider records after malformed records in config streams", async () => {
  const metadata = [...invalid.map((iconUrl) => ({ iconUrl })), ...valid];
  for (const type of ["snapshot", "providerStatuses"] as const) {
    server.handle("subscribeServerConfig", () => ({
      kind: "stream",
      chunks: metadata.map((value) => [
        type === "snapshot"
          ? { version: 1, type, config: configFor(value) }
          : { version: 1, type, payload: { providers: [provider(value)] } },
      ]),
    }));
    const seen = [];
    for await (const item of api.watchConfig()) seen.push(item);
    expect(seen).toHaveLength(metadata.length);
    for (let i = 0; i < seen.length; i++) {
      const item = seen[i]!;
      const event = ServerConfigStreamEvent.parse(item);
      if ("unknown" in event) throw new Error("Expected known event");
      const providers =
        event.type === "snapshot"
          ? event.config.providers
          : event.type === "providerStatuses"
            ? event.payload.providers
            : undefined;
      expect(providers).toEqual(i < invalid.length ? [] : [normalized(metadata[i]!)]);
    }
  }
});
