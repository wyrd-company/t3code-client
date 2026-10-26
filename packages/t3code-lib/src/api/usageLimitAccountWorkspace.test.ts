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
import { ServerConfigStreamEvent, UsageLimitSourceAccount } from "../schemas/server.ts";
import { HttpTransport } from "../transport/http.ts";
import { RpcConnection } from "../transport/rpcConnection.ts";
import { SocketTransport } from "../transport/socket.ts";
import { ServerApi } from "./server.ts";

const config: Record<string, unknown> = JSON.parse(
  NodeFS.readFileSync(new URL("../../test/fixtures/server-config.json", import.meta.url), "utf8"),
);
const account = {
  id: "sample-account",
  driver: "codex",
  usageLimits: { checkedAt: "2026-01-01T00:00:00.000Z", windows: [] },
  future: { retained: true },
};
const later = { ...account, id: "later-account" };
const sourceFor = (accounts: unknown[]) => ({
  id: "sample-source",
  kind: "cliproxy",
  label: "Sample source",
  checkedAt: "2026-01-01T00:00:00.000Z",
  accounts,
});
const valid = ["sample-workspace", "  sample padded workspace  ", "x".repeat(4096)];
const invalid = [null, "", " \t\n", true, 12, {}, []];
type WatchItem = ReturnType<ServerApi["watchConfig"]> extends AsyncIterable<infer T> ? T : never;
type SourcesEvent = Extract<WatchItem, { type: "usageLimitSourcesUpdated" }>;
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
it("types and trims optional usage-limit account workspace metadata without length limits", () => {
  expectTypeOf<UsageLimitSourceAccount["workspaceId"]>().toEqualTypeOf<string | undefined>();
  expectTypeOf<
    NonNullable<
      RpcSuccess<RpcMethods, "server.getConfig">["usageLimitSources"]
    >[number]["accounts"][number]["workspaceId"]
  >().toEqualTypeOf<string | undefined>();
  expectTypeOf<
    SourcesEvent["payload"]["sources"][number]["accounts"][number]["workspaceId"]
  >().toEqualTypeOf<string | undefined>();
  for (const workspaceId of valid) {
    expect(UsageLimitSourceAccount.parse({ ...account, workspaceId })).toEqual({
      ...account,
      workspaceId: workspaceId.trim(),
    });
  }
});
it("preserves workspace omission and unknown account metadata", () => {
  const parsed = UsageLimitSourceAccount.parse(account);
  expect(parsed).toEqual(account);
  expect(Object.hasOwn(parsed, "workspaceId")).toBe(false);
});
it("rejects malformed workspace metadata with otherwise valid accounts", () => {
  expect(UsageLimitSourceAccount.safeParse(account).success).toBe(true);
  for (const workspaceId of invalid)
    expect(UsageLimitSourceAccount.safeParse({ ...account, workspaceId }).success).toBe(false);
});
it("reads workspace metadata and omits malformed accounts while keeping later valid accounts", async () => {
  for (const workspaceId of valid) {
    server.respond("server.getConfig", {
      ...config,
      usageLimitSources: [sourceFor([{ ...account, workspaceId }, later])],
    });
    expect((await api.getConfig()).usageLimitSources).toEqual([
      sourceFor([{ ...account, workspaceId: workspaceId.trim() }, later]),
    ]);
  }
  for (const workspaceId of invalid) {
    server.respond("server.getConfig", {
      ...config,
      usageLimitSources: [sourceFor([{ ...account, workspaceId }, later])],
    });
    expect((await api.getConfig()).usageLimitSources).toEqual([sourceFor([later])]);
  }
});
it("streams workspace metadata and omits malformed accounts in later source updates", async () => {
  const metadata = [
    ...invalid.map((workspaceId) => ({ workspaceId })),
    {},
    ...valid.map((workspaceId) => ({ workspaceId })),
  ];
  let input: unknown;
  server.handle("subscribeServerConfig", (payload) => {
    input = payload;
    return {
      kind: "stream",
      chunks: metadata.map((value) => [
        {
          version: 1,
          type: "usageLimitSourcesUpdated",
          payload: { sources: [sourceFor([{ ...account, ...value }, later])] },
        },
      ]),
    };
  });
  const seen = [];
  for await (const item of api.watchConfig({ usageLimitSources: true })) seen.push(item);
  expect(input).toEqual({ usageLimitSources: true });
  expect(seen).toHaveLength(metadata.length);
  for (let i = 0; i < seen.length; i++) {
    const event = ServerConfigStreamEvent.parse(seen[i]);
    if ("unknown" in event || event.type !== "usageLimitSourcesUpdated")
      throw new Error("Expected usage-limit source update");
    const value = metadata[i] as Record<string, unknown>;
    const accounts =
      i < invalid.length
        ? [later]
        : [
            {
              ...account,
              ...("workspaceId" in value
                ? { workspaceId: String(value["workspaceId"]).trim() }
                : {}),
            },
            later,
          ];
    expect(event.payload.sources).toEqual([sourceFor(accounts)]);
  }
});
