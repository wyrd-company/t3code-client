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
import { ServerProvider, type RuntimeMode } from "../schemas/provider.ts";
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
  { supportedRuntimeModes: [] },
  { supportedRuntimeModes: ["approval-required", "auto-accept-edits", "auto", "full-access"] },
  { supportedRuntimeModes: ["future-mode", "approval-required", "future-mode"] },
];
const invalid = [null, "approval-required", true, false, 1, 0, {}];
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
it("types optional provider runtime mode metadata and preserves arrays, growing strings and omission", () => {
  expectTypeOf<ServerProvider["supportedRuntimeModes"]>().toEqualTypeOf<
    RuntimeMode[] | undefined
  >();
  expectTypeOf<
    RpcSuccess<RpcMethods, "server.getConfig">["providers"][number]["supportedRuntimeModes"]
  >().toEqualTypeOf<RuntimeMode[] | undefined>();
  expectTypeOf<
    Awaited<ReturnType<ServerApi["providers"]>>[number]["supportedRuntimeModes"]
  >().toEqualTypeOf<RuntimeMode[] | undefined>();
  for (const metadata of valid) {
    const parsed = ServerProvider.parse(provider(metadata));
    expect(parsed).toEqual(provider(metadata));
    expect(Object.hasOwn(parsed, "supportedRuntimeModes")).toBe(
      Object.hasOwn(metadata, "supportedRuntimeModes"),
    );
  }
});
it("rejects non-array provider runtime mode metadata on otherwise valid provider records", () => {
  expect(ServerProvider.safeParse(provider({})).success).toBe(true);
  for (const supportedRuntimeModes of invalid)
    expect(ServerProvider.safeParse(provider({ supportedRuntimeModes })).success).toBe(false);
});
it("reads typed provider runtime mode metadata and omission through existing config and provider reads", async () => {
  for (const metadata of valid) {
    server.respond("server.getConfig", configFor(metadata));
    expect((await api.getConfig()).providers).toEqual([provider(metadata)]);
    expect(await api.providers()).toEqual([provider(metadata)]);
  }
});
it("omits provider records with malformed runtime mode metadata through existing config reads", async () => {
  for (const supportedRuntimeModes of invalid) {
    server.respond("server.getConfig", configFor({ supportedRuntimeModes }));
    expect((await api.getConfig()).providers).toEqual([]);
  }
});
it("keeps later valid provider records after malformed runtime mode metadata in config streams", async () => {
  const metadata = [
    ...invalid.map((supportedRuntimeModes) => ({ supportedRuntimeModes })),
    ...valid,
  ];
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

it("drops malformed runtime mode entries while retaining strings in order", async () => {
  const metadata = {
    supportedRuntimeModes: [null, "auto", 1, {}, "future-mode", false, [], "full-access"],
  };
  const expected = provider({ supportedRuntimeModes: ["auto", "future-mode", "full-access"] });
  expect(ServerProvider.parse(provider(metadata))).toEqual(expected);
  server.respond("server.getConfig", configFor(metadata));
  expect((await api.getConfig()).providers).toEqual([expected]);
  expect(await api.providers()).toEqual([expected]);
  for (const type of ["snapshot", "providerStatuses"] as const) {
    server.handle("subscribeServerConfig", () => ({
      kind: "stream",
      chunks: [
        [
          type === "snapshot"
            ? { version: 1, type, config: configFor(metadata) }
            : { version: 1, type, payload: { providers: [provider(metadata)] } },
        ],
      ],
    }));
    for await (const item of api.watchConfig()) {
      const event = ServerConfigStreamEvent.parse(item);
      if ("unknown" in event) throw new Error("Expected known event");
      expect(
        event.type === "snapshot"
          ? event.config.providers
          : event.type === "providerStatuses"
            ? event.payload.providers
            : undefined,
      ).toEqual([expected]);
    }
  }
});
