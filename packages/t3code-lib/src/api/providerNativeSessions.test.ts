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
const nativeSessions = { canList: true, canLoad: false, canResume: true };
const valid = [
  {},
  { nativeSessions },
  { nativeSessions: { canList: false, canLoad: true, canResume: false } },
  { nativeSessions: { ...nativeSessions, canDelete: true } },
  { nativeSessions: { ...nativeSessions, canDelete: false, futureNested: "sample" } },
];
const invalid: unknown[] = [null, "true", true, 1, [], {}];
for (const key of ["canList", "canLoad", "canResume"] as const) {
  const missing: Record<string, unknown> = { ...nativeSessions };
  delete missing[key];
  invalid.push(missing);
  for (const value of [null, "true", 0, {}, []]) invalid.push({ ...nativeSessions, [key]: value });
}
for (const canDelete of [null, "false", 0, {}, []]) invalid.push({ ...nativeSessions, canDelete });
type NativeSessions = {
  canList: boolean;
  canLoad: boolean;
  canResume: boolean;
  canDelete?: boolean | undefined;
  [key: string]: unknown;
};
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
it("types optional provider native session metadata and preserves nested booleans and omission", () => {
  expectTypeOf<ServerProvider["nativeSessions"]>().toEqualTypeOf<NativeSessions | undefined>();
  expectTypeOf<
    RpcSuccess<RpcMethods, "server.getConfig">["providers"][number]["nativeSessions"]
  >().toEqualTypeOf<NativeSessions | undefined>();
  expectTypeOf<
    Awaited<ReturnType<ServerApi["providers"]>>[number]["nativeSessions"]
  >().toEqualTypeOf<NativeSessions | undefined>();
  for (const metadata of valid) {
    const parsed = ServerProvider.parse(provider(metadata));
    expect(parsed).toEqual(provider(metadata));
    expect(Object.hasOwn(parsed, "nativeSessions")).toBe(Object.hasOwn(metadata, "nativeSessions"));
  }
});
it("rejects malformed provider native session metadata on otherwise valid provider records", () => {
  expect(ServerProvider.safeParse(provider({})).success).toBe(true);
  for (const nativeSessions of invalid)
    expect(ServerProvider.safeParse(provider({ nativeSessions })).success).toBe(false);
});
it("reads typed provider native session metadata and omission through existing config and provider reads", async () => {
  for (const metadata of valid) {
    server.respond("server.getConfig", configFor(metadata));
    expect((await api.getConfig()).providers).toEqual([provider(metadata)]);
    expect(await api.providers()).toEqual([provider(metadata)]);
  }
});
it("omits provider records with malformed native session metadata through existing config reads", async () => {
  for (const nativeSessions of invalid) {
    server.respond("server.getConfig", configFor({ nativeSessions }));
    expect((await api.getConfig()).providers).toEqual([]);
  }
});
it("keeps later valid provider records after malformed native session metadata in config streams", async () => {
  const metadata = [...invalid.map((nativeSessions) => ({ nativeSessions })), ...valid];
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
      const event = ServerConfigStreamEvent.parse(seen[i]!);
      if ("unknown" in event) throw new Error("Expected known event");
      const providers =
        event.type === "snapshot"
          ? event.config.providers
          : event.type === "providerStatuses"
            ? event.payload.providers
            : undefined;
      expect(providers).toEqual(i < invalid.length ? [] : [provider(metadata[i]!)]);
    }
  }
});
