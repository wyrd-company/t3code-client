// ---
// relationships:
//   verifies: library-facades
// ---
import * as NodeFS from "node:fs";
import { afterEach, beforeEach, expect, expectTypeOf, it } from "vite-plus/test";
import { FakeT3Server } from "../../test/support/fakeServer.ts";
import { T3DecodeError } from "../errors.ts";
import { RpcClient } from "../rpc/client.ts";
import { rpcMethods } from "../rpc/registry.ts";
import type { RpcMethods } from "../rpc/registry.ts";
import type { RpcSuccess } from "../rpc/spec.ts";
import { EnvironmentTheme, ServerConfigStreamEvent } from "../schemas/server.ts";
import { HttpTransport } from "../transport/http.ts";
import { RpcConnection } from "../transport/rpcConnection.ts";
import { SocketTransport } from "../transport/socket.ts";
import { ServerApi } from "./server.ts";

const theme = (metadata: Record<string, unknown>) => ({
  id: "sample-palette",
  name: "Sample palette",
  appearance: "dark",
  future: true,
  ...metadata,
});
const valid = [
  {},
  ...["#000", "#ABC", "#aBc", "#012345", "#aAbBcC", "#FFFFFF"].map((canvas) => ({ canvas })),
];
const invalid = [
  null,
  false,
  123,
  [],
  {},
  "",
  "red",
  "#12",
  "#1234",
  "#12345",
  "#1234567",
  "#ggg",
  " #abc",
  "#abc ",
  "#abc\n",
];
const config: Record<string, unknown> = JSON.parse(
  NodeFS.readFileSync(new URL("../../test/fixtures/server-config.json", import.meta.url), "utf8"),
);
const configFor = (metadata: Record<string, unknown>) => ({
  ...config,
  environmentThemes: [theme(metadata)],
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
it("types optional theme canvas through schema, registry, facade and preserves exact colors", () => {
  type Config = Awaited<ReturnType<ServerApi["getConfig"]>>;
  type Wire = RpcSuccess<RpcMethods, "server.getConfig">;
  expectTypeOf<NonNullable<Config["environmentThemes"]>[number]["canvas"]>().toEqualTypeOf<
    string | undefined
  >();
  expectTypeOf<NonNullable<Wire["environmentThemes"]>[number]["canvas"]>().toEqualTypeOf<
    string | undefined
  >();
  for (const metadata of valid) {
    const parsed = EnvironmentTheme.parse(theme(metadata));
    expectTypeOf(parsed.canvas).toEqualTypeOf<string | undefined>();
    expect(parsed).toEqual(theme(metadata));
    expect(Object.hasOwn(parsed, "canvas")).toBe(Object.hasOwn(metadata, "canvas"));
  }
});
it("rejects malformed canvas values with otherwise valid themes", () => {
  expect(EnvironmentTheme.safeParse(theme({})).success).toBe(true);
  for (const canvas of invalid)
    expect(EnvironmentTheme.safeParse(theme({ canvas })).success).toBe(false);
});
it("reads typed canvas and omission through existing config RPC", async () => {
  for (const metadata of valid) {
    server.respond("server.getConfig", configFor(metadata));
    const parsed = (await api.getConfig()).environmentThemes?.[0];
    if (!parsed) throw new Error("Expected theme");
    expectTypeOf(parsed.canvas).toEqualTypeOf<string | undefined>();
    expect(parsed).toEqual(theme(metadata));
    expect(Object.hasOwn(parsed, "canvas")).toBe(Object.hasOwn(metadata, "canvas"));
  }
});
it("rejects malformed canvas through existing config RPC", async () => {
  for (const canvas of invalid) {
    server.respond("server.getConfig", configFor({ canvas }));
    await expect(api.getConfig()).rejects.toBeInstanceOf(T3DecodeError);
  }
});
it("keeps config stream errors and recovers with typed canvas in snapshots and theme updates", async () => {
  const metadata = [...invalid.map((canvas) => ({ canvas })), ...valid];
  for (const type of ["snapshot", "environmentThemesUpdated"] as const) {
    server.handle("subscribeServerConfig", () => ({
      kind: "stream",
      chunks: metadata.map((value) => [
        type === "snapshot"
          ? { version: 1, type, config: configFor(value) }
          : { version: 1, type, payload: { themes: [theme(value)] } },
      ]),
    }));
    const seen = [];
    for await (const item of api.watchConfig({ environmentThemes: true })) seen.push(item);
    expect(seen).toHaveLength(metadata.length);
    for (let i = 0; i < seen.length; i++) {
      const item = seen[i]!;
      if (i < invalid.length) {
        expect("kind" in item && item.kind === "decode-error").toBe(true);
        continue;
      }
      const event = ServerConfigStreamEvent.parse(item);
      if ("unknown" in event) throw new Error("Expected known event");
      const value =
        event.type === "snapshot"
          ? event.config.environmentThemes?.[0]
          : event.type === "environmentThemesUpdated"
            ? event.payload.themes[0]
            : undefined;
      if (!value) throw new Error("Expected theme");
      expectTypeOf(value.canvas).toEqualTypeOf<string | undefined>();
      const expected = metadata[i]!;
      expect(value).toEqual(theme(expected));
      expect(Object.hasOwn(value, "canvas")).toBe(Object.hasOwn(expected, "canvas"));
    }
  }
});
