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
import type { UnknownVariant } from "../schemas/common.ts";
import type { ResolvedKeybindingRule } from "../schemas/keybindings.ts";
import { ResolvedKeybindingsConfig, ServerConfigStreamEvent } from "../schemas/server.ts";
import { HttpTransport } from "../transport/http.ts";
import { RpcConnection } from "../transport/rpcConnection.ts";
import { SocketTransport } from "../transport/socket.ts";
import { ServerApi } from "./server.ts";

const config: Record<string, unknown> = JSON.parse(
  NodeFS.readFileSync(new URL("../../test/fixtures/server-config.json", import.meta.url), "utf8"),
);
const configFor = (keybindings: unknown) => ({ ...config, keybindings });
const shortcut = {
  key: "k",
  metaKey: false,
  ctrlKey: true,
  shiftKey: false,
  altKey: false,
  modKey: true,
};
const futureNode = { type: "future.node", detail: { retained: true } };
const known = {
  command: "composer.increaseEffort",
  shortcut,
  whenAst: { type: "or", left: { type: "identifier", name: "sampleFocus" }, right: futureNode },
};
const script = { command: "script.sample-task.run", shortcut, future: { retained: true } };
const decoded = [
  {
    ...known,
    whenAst: { ...known.whenAst, right: { unknown: true, raw: futureNode } },
  },
  script,
];
const malformed = [
  null,
  "rule",
  { shortcut },
  { command: 7, shortcut },
  { command: "chat.new" },
  { command: "chat.new", shortcut: { ...shortcut, key: " " } },
  { command: "chat.new", shortcut: { ...shortcut, modKey: "true" } },
  { command: "chat.new", shortcut, whenAst: { type: "identifier", name: "" } },
  { command: "chat.new", shortcut, whenAst: { type: "not", node: { type: "and" } } },
];
const many = (count: number) => Array.from({ length: count }, () => script);

type ConfigWatchItem =
  ReturnType<ServerApi["watchConfig"]> extends AsyncIterable<infer Item> ? Item : never;

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

it("types resolved keybindings on every configuration surface", () => {
  expectTypeOf<ResolvedKeybindingsConfig>().toEqualTypeOf<ResolvedKeybindingRule[]>();
  expectTypeOf<
    RpcSuccess<RpcMethods, "server.getConfig">["keybindings"][number]
  >().toEqualTypeOf<ResolvedKeybindingRule>();
  expectTypeOf<
    Awaited<ReturnType<ServerApi["getConfig"]>>["keybindings"][number]
  >().toEqualTypeOf<ResolvedKeybindingRule>();
  type Event = Exclude<ServerConfigStreamEvent, UnknownVariant<"type">>;
  expectTypeOf<
    Extract<Event, { type: "keybindingsUpdated" }>["payload"]["keybindings"][number]
  >().toEqualTypeOf<ResolvedKeybindingRule>();
  expectTypeOf<
    Extract<Event, { type: "snapshot" }>["config"]["keybindings"][number]
  >().toEqualTypeOf<ResolvedKeybindingRule>();
});

it("reads typed rules and omits malformed rules while keeping later valid ones", async () => {
  server.respond("server.getConfig", configFor([]));
  expect((await api.getConfig()).keybindings).toEqual([]);
  server.respond("server.getConfig", configFor([...malformed, known, ...malformed, script]));
  expect((await api.getConfig()).keybindings).toEqual(decoded);
});

it("counts the 256 rule bound after omission on configuration reads", async () => {
  server.respond("server.getConfig", configFor([...malformed, ...many(256)]));
  expect((await api.getConfig()).keybindings).toHaveLength(256);
  server.respond("server.getConfig", configFor(many(257)));
  await expect(api.getConfig()).rejects.toThrow();
  server.respond("server.getConfig", configFor("not an array"));
  await expect(api.getConfig()).rejects.toThrow();
});

it("keeps later snapshot and keybinding update chunks usable after malformed keybindings", async () => {
  const valid = [...malformed, known, script];
  const updated = (keybindings: unknown) => [
    { version: 1, type: "keybindingsUpdated", payload: { keybindings, issues: [] } },
  ];
  server.handle("subscribeServerConfig", () => ({
    kind: "stream",
    chunks: [
      [{ version: 1, type: "snapshot", config: configFor("not an array") }],
      [{ version: 1, type: "snapshot", config: configFor(many(257)) }],
      [{ version: 1, type: "snapshot", config: configFor(valid) }],
      updated({ command: "chat.new", shortcut }),
      updated([...many(257)]),
      updated(valid),
    ],
  }));
  const seen: ConfigWatchItem[] = [];
  for await (const item of api.watchConfig()) seen.push(item);
  expect(seen.map((item) => ("kind" in item ? item.kind : "item"))).toEqual([
    "decode-error",
    "decode-error",
    "item",
    "decode-error",
    "decode-error",
    "item",
  ]);
  const keybindingsOf = (item: ConfigWatchItem | undefined) => {
    if (item === undefined || "kind" in item || "unknown" in item)
      throw new Error("Expected a known event");
    if (item.type === "snapshot") return item.config.keybindings;
    if (item.type === "keybindingsUpdated") return item.payload.keybindings;
    throw new Error("Expected a keybinding-bearing event");
  };
  expect(keybindingsOf(seen[2])).toEqual(decoded);
  expect(keybindingsOf(seen[5])).toEqual(decoded);
});
