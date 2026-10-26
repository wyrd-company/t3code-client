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
import {
  ServerConfigIssue,
  ServerConfigIssues,
  ServerConfigStreamEvent,
} from "../schemas/server.ts";
import { HttpTransport } from "../transport/http.ts";
import { RpcConnection } from "../transport/rpcConnection.ts";
import { SocketTransport } from "../transport/socket.ts";
import { ServerApi } from "./server.ts";

type KnownIssue =
  | { kind: "keybindings.malformed-config"; message: string; [key: string]: unknown }
  | { kind: "keybindings.invalid-entry"; message: string; index: number; [key: string]: unknown };
type Issue = KnownIssue | UnknownVariant<"kind">;

const config: Record<string, unknown> = JSON.parse(
  NodeFS.readFileSync(new URL("../../test/fixtures/server-config.json", import.meta.url), "utf8"),
);
const configFor = (issues: unknown) => ({ ...config, issues });
const malformedConfig = { kind: "keybindings.malformed-config", message: "Sample problem." };
const invalidEntry = { kind: "keybindings.invalid-entry", message: "Sample entry.", index: 2 };
const futureIssue = { kind: "future.issue", detail: { retained: true } };
const messages = ["Sample text", "  padded sample  ", "x".repeat(4096)];
const indexes = [0, 3, -1, 1.5, Number.MAX_VALUE];
const badMessages = [undefined, null, "", " \t\n", 12, true, {}];
const badIndexes = [undefined, null, "2", true, {}, Number.NaN, Number.POSITIVE_INFINITY];
const badRecords = [
  null,
  "issue",
  3,
  [],
  {},
  { kind: 7, message: "Sample" },
  { message: "Sample" },
];
const without = (record: Record<string, unknown>, key: string) =>
  Object.fromEntries(Object.entries(record).filter(([name]) => name !== key));
const withField = (record: Record<string, unknown>, key: string, value: unknown) =>
  value === undefined ? without(record, key) : { ...record, [key]: value };

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

it("types configuration issues as the two known kinds or an unknown variant", () => {
  expectTypeOf<ServerConfigIssue>().toEqualTypeOf<Issue>();
  expectTypeOf<ServerConfigIssues>().toEqualTypeOf<Issue[]>();
  expectTypeOf<
    RpcSuccess<RpcMethods, "server.getConfig">["issues"][number]
  >().toEqualTypeOf<Issue>();
  expectTypeOf<
    Awaited<ReturnType<ServerApi["getConfig"]>>["issues"][number]
  >().toEqualTypeOf<Issue>();
  type Event = Exclude<ServerConfigStreamEvent, UnknownVariant<"type">>;
  expectTypeOf<
    Extract<Event, { type: "keybindingsUpdated" }>["payload"]["issues"][number]
  >().toEqualTypeOf<Issue>();
  expectTypeOf<
    Extract<Event, { type: "snapshot" }>["config"]["issues"][number]
  >().toEqualTypeOf<Issue>();
});

it("decodes both kinds with trimmed messages and plain numeric indexes", () => {
  for (const message of messages) {
    expect(ServerConfigIssue.parse({ ...malformedConfig, message })).toEqual({
      ...malformedConfig,
      message: message.trim(),
    });
    expect(ServerConfigIssue.parse({ ...invalidEntry, message })).toEqual({
      ...invalidEntry,
      message: message.trim(),
    });
  }
  for (const index of indexes)
    expect(ServerConfigIssue.parse({ ...invalidEntry, index })).toEqual({ ...invalidEntry, index });
});

it("preserves unknown kinds and extra issue metadata", () => {
  expect(ServerConfigIssue.parse(futureIssue)).toEqual({ unknown: true, raw: futureIssue });
  const extra = { future: { retained: true } };
  expect(ServerConfigIssue.parse({ ...malformedConfig, ...extra })).toEqual({
    ...malformedConfig,
    ...extra,
  });
  expect(ServerConfigIssue.parse({ ...invalidEntry, ...extra })).toEqual({
    ...invalidEntry,
    ...extra,
  });
});

it("rejects malformed messages with otherwise valid issues", () => {
  expect(ServerConfigIssue.safeParse(malformedConfig).success).toBe(true);
  expect(ServerConfigIssue.safeParse(invalidEntry).success).toBe(true);
  for (const message of badMessages) {
    expect(
      ServerConfigIssue.safeParse(withField(malformedConfig, "message", message)).success,
    ).toBe(false);
    expect(ServerConfigIssue.safeParse(withField(invalidEntry, "message", message)).success).toBe(
      false,
    );
  }
});

it("rejects malformed invalid-entry indexes with otherwise valid issues", () => {
  for (const index of badIndexes)
    expect(ServerConfigIssue.safeParse(withField(invalidEntry, "index", index)).success).toBe(
      false,
    );
});

it("rejects records without a string kind", () => {
  for (const record of badRecords) expect(ServerConfigIssue.safeParse(record).success).toBe(false);
});

it("reads typed issues and omits malformed records while keeping later valid ones", async () => {
  server.respond("server.getConfig", configFor([]));
  expect((await api.getConfig()).issues).toEqual([]);
  const malformed = [
    ...badMessages.map((message) => withField(invalidEntry, "message", message)),
    ...badIndexes.map((index) => withField(invalidEntry, "index", index)),
    ...badRecords,
  ];
  server.respond(
    "server.getConfig",
    configFor([malformedConfig, ...malformed, invalidEntry, futureIssue]),
  );
  expect((await api.getConfig()).issues).toEqual([
    malformedConfig,
    invalidEntry,
    { unknown: true, raw: futureIssue },
  ]);
});

it("keeps later snapshot and keybinding update chunks usable after malformed issues", async () => {
  const valid = [invalidEntry, futureIssue];
  const decoded = [invalidEntry, { unknown: true, raw: futureIssue }];
  server.handle("subscribeServerConfig", () => ({
    kind: "stream",
    chunks: [
      [{ version: 1, type: "snapshot", config: configFor([{ ...invalidEntry, index: "2" }]) }],
      [{ version: 1, type: "snapshot", config: configFor("not an array") }],
      [{ version: 1, type: "snapshot", config: configFor(valid) }],
      [
        {
          version: 1,
          type: "keybindingsUpdated",
          payload: { keybindings: [], issues: [{ ...malformedConfig, message: " " }] },
        },
      ],
      [{ version: 1, type: "keybindingsUpdated", payload: { keybindings: [], issues: 3 } }],
      [{ version: 1, type: "keybindingsUpdated", payload: { keybindings: [], issues: valid } }],
    ],
  }));
  const seen: ConfigWatchItem[] = [];
  for await (const item of api.watchConfig()) seen.push(item);
  expect(seen.map((item) => ("kind" in item ? item.kind : "item"))).toEqual([
    "item",
    "decode-error",
    "item",
    "item",
    "decode-error",
    "item",
  ]);
  const issuesOf = (item: ConfigWatchItem | undefined) => {
    if (item === undefined || "kind" in item || "unknown" in item)
      throw new Error("Expected a known event");
    const event = item;
    if (event.type === "snapshot") return event.config.issues;
    if (event.type === "keybindingsUpdated") return event.payload.issues;
    throw new Error("Expected an issue-bearing event");
  };
  expect(issuesOf(seen[0])).toEqual([]);
  expect(issuesOf(seen[2])).toEqual(decoded);
  expect(issuesOf(seen[3])).toEqual([]);
  expect(issuesOf(seen[5])).toEqual(decoded);
});
