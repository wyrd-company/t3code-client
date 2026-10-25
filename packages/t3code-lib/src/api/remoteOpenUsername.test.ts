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
import { RemoteOpenTarget, ServerConfigStreamEvent } from "../schemas/server.ts";
import { HttpTransport } from "../transport/http.ts";
import { RpcConnection } from "../transport/rpcConnection.ts";
import { SocketTransport } from "../transport/socket.ts";
import { ServerApi } from "./server.ts";

const config: Record<string, unknown> = JSON.parse(
  NodeFS.readFileSync(new URL("../../test/fixtures/server-config.json", import.meta.url), "utf8"),
);
const target = { kind: "mdns", host: "sample.local", future: { retained: true } };
const configFor = (remoteOpenTargets: unknown[]) => ({ ...config, remoteOpenTargets });
const valid = ["sample", "arbitrary text", "  sample  ", "x".repeat(4096)];
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
it("types and trims optional remote-open usernames without extra format or length constraints", () => {
  expectTypeOf<RemoteOpenTarget["username"]>().toEqualTypeOf<string | undefined>();
  expectTypeOf<
    NonNullable<RpcSuccess<RpcMethods, "server.getConfig">["remoteOpenTargets"]>[number]["username"]
  >().toEqualTypeOf<string | undefined>();
  expectTypeOf<
    NonNullable<
      Awaited<ReturnType<ServerApi["getConfig"]>>["remoteOpenTargets"]
    >[number]["username"]
  >().toEqualTypeOf<string | undefined>();
  for (const username of valid)
    expect(RemoteOpenTarget.parse({ ...target, username })).toEqual({
      ...target,
      username: username.trim(),
    });
});
it("preserves omission, unknown target metadata and growing target kinds", () => {
  const parsed = RemoteOpenTarget.parse({ ...target, kind: "future-kind" });
  expect(parsed).toEqual({ ...target, kind: "future-kind" });
  expect(Object.hasOwn(parsed, "username")).toBe(false);
});
it("rejects malformed usernames with otherwise valid targets", () => {
  expect(RemoteOpenTarget.safeParse(target).success).toBe(true);
  for (const username of invalid)
    expect(RemoteOpenTarget.safeParse({ ...target, username }).success).toBe(false);
});
it("reads trimmed usernames and omits malformed targets while retaining later valid rows", async () => {
  server.respond("server.getConfig", configFor([]));
  expect((await api.getConfig()).remoteOpenTargets).toEqual([]);
  server.respond("server.getConfig", configFor([target]));
  expect((await api.getConfig()).remoteOpenTargets).toEqual([target]);
  for (const username of valid) {
    server.respond("server.getConfig", configFor([{ ...target, username }]));
    expect((await api.getConfig()).remoteOpenTargets).toEqual([
      { ...target, username: username.trim() },
    ]);
  }
  for (const username of invalid) {
    server.respond("server.getConfig", configFor([{ ...target, username }, target]));
    expect((await api.getConfig()).remoteOpenTargets).toEqual([target]);
  }
});
it("preserves valid configuration snapshots after malformed target rows", async () => {
  const rows = [
    ...invalid.map((username) => ({ ...target, username })),
    target,
    ...valid.map((username) => ({ ...target, username })),
  ];
  server.handle("subscribeServerConfig", () => ({
    kind: "stream",
    chunks: rows.map((row) => [{ version: 1, type: "snapshot", config: configFor([row, target]) }]),
  }));
  const seen = [];
  for await (const item of api.watchConfig()) seen.push(item);
  expect(seen).toHaveLength(rows.length);
  for (let i = 0; i < seen.length; i++) {
    const event = ServerConfigStreamEvent.parse(seen[i]);
    if ("unknown" in event || event.type !== "snapshot") throw new Error("Expected snapshot");
    const row = rows[i];
    if (row === undefined) throw new Error("Missing controlled row");
    const expected =
      i < invalid.length
        ? [target]
        : [
            { ...row, ...("username" in row ? { username: String(row.username).trim() } : {}) },
            target,
          ];
    expect(event.config.remoteOpenTargets).toEqual(expected);
  }
});
