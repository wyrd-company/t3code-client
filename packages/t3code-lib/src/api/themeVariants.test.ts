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
type Variants = {
  [key: string]: unknown;
  light?: Record<string, string> | undefined;
  dark?: Record<string, string> | undefined;
};
const valid = [
  {},
  { variants: {} },
  { variants: { light: {} } },
  { variants: { dark: {} } },
  { variants: { light: { background: "#AbC", sampleTone: "  oklch(0.8 0.1 20)  " } } },
  { variants: { dark: { ["A" + "b".repeat(63)]: "x".repeat(64), Z9: "  x  " } } },
  { variants: { light: { background: "#AbC" }, dark: { background: "#123456" } } },
  { variants: { future: { custom: true }, light: { sampleTone: "  x  " } } },
];
const normalized = (metadata: Record<string, unknown>) => {
  const parsed = theme(metadata);
  if (metadata["variants"] === undefined) return parsed;
  const variants = metadata["variants"] as Variants;
  const result = { ...variants };
  for (const appearance of ["light", "dark"] as const) {
    const palette = variants[appearance];
    if (palette !== undefined)
      result[appearance] = Object.fromEntries(
        Object.entries(palette).map(([k, v]) => [k, v.trim()]),
      );
  }
  return { ...parsed, variants: result };
};
const malformedPalettes = [
  null,
  false,
  1,
  "",
  [],
  { "": "x" },
  { "1tone": "x" },
  { "tone-key": "x" },
  { ["a".repeat(65)]: "x" },
  { tone: "" },
  { tone: "  " },
  { tone: "x".repeat(65) },
  { tone: 1 },
  { tone: null },
  { tone: false },
  { tone: [] },
  { tone: {} },
];
const invalid = [
  null,
  false,
  1,
  "",
  [],
  ...malformedPalettes.flatMap((palette) => [
    { light: palette, dark: { background: "#123456" } },
    { light: { background: "#AbC" }, dark: palette },
  ]),
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
it("types optional theme variants through schema, registry, facade and trims palette values", () => {
  type Config = Awaited<ReturnType<ServerApi["getConfig"]>>;
  type Wire = RpcSuccess<RpcMethods, "server.getConfig">;
  expectTypeOf<NonNullable<Config["environmentThemes"]>[number]["variants"]>().toEqualTypeOf<
    Variants | undefined
  >();
  expectTypeOf<NonNullable<Wire["environmentThemes"]>[number]["variants"]>().toEqualTypeOf<
    Variants | undefined
  >();
  for (const metadata of valid) {
    const parsed = EnvironmentTheme.parse(theme(metadata));
    expectTypeOf(parsed.variants).toEqualTypeOf<Variants | undefined>();
    expect(parsed).toEqual(normalized(metadata));
    expect(Object.hasOwn(parsed, "variants")).toBe(Object.hasOwn(metadata, "variants"));
  }
});
it("rejects malformed variants values with otherwise valid themes", () => {
  expect(EnvironmentTheme.safeParse(theme({})).success).toBe(true);
  for (const variants of invalid)
    expect(EnvironmentTheme.safeParse(theme({ variants })).success).toBe(false);
});
it("reads typed variants and omission through existing config RPC", async () => {
  for (const metadata of valid) {
    server.respond("server.getConfig", configFor(metadata));
    const parsed = (await api.getConfig()).environmentThemes?.[0];
    if (!parsed) throw new Error("Expected theme");
    expectTypeOf(parsed.variants).toEqualTypeOf<Variants | undefined>();
    expect(parsed).toEqual(normalized(metadata));
    expect(Object.hasOwn(parsed, "variants")).toBe(Object.hasOwn(metadata, "variants"));
  }
});
it("rejects malformed variants through existing config RPC", async () => {
  for (const variants of invalid) {
    server.respond("server.getConfig", configFor({ variants }));
    await expect(api.getConfig()).rejects.toBeInstanceOf(T3DecodeError);
  }
});
it("keeps config stream errors and recovers with typed variants in snapshots and theme updates", async () => {
  const metadata = [...invalid.map((variants) => ({ variants })), ...valid];
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
      expectTypeOf(value.variants).toEqualTypeOf<Variants | undefined>();
      const expected = metadata[i]!;
      expect(value).toEqual(normalized(expected));
      expect(Object.hasOwn(value, "variants")).toBe(Object.hasOwn(expected, "variants"));
    }
  }
});
