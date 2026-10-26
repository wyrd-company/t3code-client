// ---
// relationships:
//   verifies: library-wire
// ---
import * as NodeFS from "node:fs";
import { describe, expect, expectTypeOf, it } from "vite-plus/test";
import type { ServerApi } from "../index.ts";
import { schemas } from "../index.ts";
import type { RpcMethods } from "../rpc/registry.ts";
import type { RpcSuccess } from "../rpc/spec.ts";
import { ServerConfig, ServerConfigStreamSnapshotEvent } from "./server.ts";

const fixture: unknown = JSON.parse(
  NodeFS.readFileSync(new URL("../../test/fixtures/server-config.json", import.meta.url), "utf8"),
);
const baseline = ServerConfig.parse(fixture);
delete baseline.directEndpoints;
const snapshot = (config: unknown) => ({ version: 1, type: "snapshot", config });
const endpoint = { kind: "lan", httpBaseUrl: "http://192.168.1.2:3000/" };

describe("optional direct endpoint metadata", () => {
  it("exposes typed endpoints through public schema, registry and facade", () => {
    type Expected =
      | Array<{
          kind: "lan" | "tailnet" | (string & {});
          httpBaseUrl: string;
          [key: string]: unknown;
        }>
      | undefined;
    type Config = Awaited<ReturnType<ServerApi["getConfig"]>>;
    type WireConfig = RpcSuccess<RpcMethods, "server.getConfig">;
    expectTypeOf<schemas.server.ServerConfig["directEndpoints"]>().toEqualTypeOf<Expected>();
    expectTypeOf<Config["directEndpoints"]>().toEqualTypeOf<Expected>();
    expectTypeOf<WireConfig["directEndpoints"]>().toEqualTypeOf<Expected>();
    expectTypeOf<
      ServerConfigStreamSnapshotEvent["config"]["directEndpoints"]
    >().toEqualTypeOf<Expected>();
  });

  it("preserves omission, empty lists, both kinds, unknown strings and extra metadata", () => {
    expect(Object.hasOwn(baseline, "directEndpoints")).toBe(false);
    expect(
      Object.hasOwn(
        ServerConfigStreamSnapshotEvent.parse(snapshot(baseline)).config,
        "directEndpoints",
      ),
    ).toBe(false);
    for (const directEndpoints of [
      [],
      [endpoint],
      [{ ...endpoint, kind: "tailnet" }],
      [{ ...endpoint, kind: "future", future: true }],
    ]) {
      const config = { ...baseline, directEndpoints, futureConfig: true };
      expect(ServerConfig.parse(config)).toEqual(config);
      expect(ServerConfigStreamSnapshotEvent.parse(snapshot(config)).config).toEqual(config);
    }
  });

  it("drops malformed entries and trims endpoint strings without rejecting the config", () => {
    const directEndpoints = [
      endpoint,
      null,
      false,
      1,
      "endpoint",
      [],
      {},
      { ...endpoint, kind: 1 },
      { ...endpoint, httpBaseUrl: " " },
      { ...endpoint, httpBaseUrl: null },
      { kind: "lan" },
      { httpBaseUrl: "url" },
    ];
    const config = { ...baseline, directEndpoints };
    expect(ServerConfig.parse(config).directEndpoints).toEqual([endpoint]);
    expect(ServerConfigStreamSnapshotEvent.parse(snapshot(config)).config.directEndpoints).toEqual([
      endpoint,
    ]);
    expect(
      ServerConfig.parse({
        ...baseline,
        directEndpoints: [{ kind: " lan ", httpBaseUrl: " url " }],
      }).directEndpoints,
    ).toEqual([{ kind: " lan ", httpBaseUrl: "url" }]);
  });

  it("rejects malformed direct endpoint containers on valid config and snapshots", () => {
    expect(ServerConfig.safeParse(baseline).success).toBe(true);
    for (const directEndpoints of [null, false, 1, "endpoints", {}]) {
      const config = { ...baseline, directEndpoints };
      expect(ServerConfig.safeParse(config).success).toBe(false);
      expect(ServerConfigStreamSnapshotEvent.safeParse(snapshot(config)).success).toBe(false);
    }
  });
});
