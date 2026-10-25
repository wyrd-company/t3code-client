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

const config: unknown = JSON.parse(
  NodeFS.readFileSync(new URL("../../test/fixtures/server-config.json", import.meta.url), "utf8"),
);
const baseline = ServerConfig.parse(config);
const stall = { detectedAt: "2026-01-01T00:00:00.000Z", durationMs: 0, cpuCount: 1 };
const snapshot = (config: unknown) => ({ version: 1, type: "snapshot", config });

describe("optional recent server event-loop stall metadata", () => {
  it("exposes the structured optional field through public schema, registry and facades", () => {
    type Expected =
      | {
          detectedAt: string;
          durationMs: number;
          cpuCount: number;
          loadAverage?: number | undefined;
          [key: string]: unknown;
        }
      | undefined;
    type Config = Awaited<ReturnType<ServerApi["getConfig"]>>;
    type WireConfig = RpcSuccess<RpcMethods, "server.getConfig">;
    expectTypeOf<schemas.server.ServerConfig["lastEventLoopStall"]>().toEqualTypeOf<Expected>();
    expectTypeOf<Config["lastEventLoopStall"]>().toEqualTypeOf<Expected>();
    expectTypeOf<WireConfig["lastEventLoopStall"]>().toEqualTypeOf<Expected>();
    expectTypeOf<
      ServerConfigStreamSnapshotEvent["config"]["lastEventLoopStall"]
    >().toEqualTypeOf<Expected>();
  });

  it("preserves omission, valid boundary values, optional load and unknown metadata", () => {
    expect(Object.hasOwn(baseline, "lastEventLoopStall")).toBe(false);
    expect(
      Object.hasOwn(
        ServerConfigStreamSnapshotEvent.parse(snapshot(baseline)).config,
        "lastEventLoopStall",
      ),
    ).toBe(false);
    for (const lastEventLoopStall of [
      stall,
      { ...stall, detectedAt: "" },
      { ...stall, durationMs: 2500, cpuCount: 8, loadAverage: 0 },
      { ...stall, loadAverage: 1.25, futureDetail: "preserved" },
      { ...stall, loadAverage: -0.5 },
    ]) {
      const value = { ...baseline, lastEventLoopStall, futureConfig: "preserved" };
      expect(ServerConfig.parse(value)).toEqual(value);
      expect(ServerConfigStreamSnapshotEvent.parse(snapshot(value)).config).toEqual(value);
    }
  });

  it("rejects malformed recent stall metadata on otherwise valid configuration and snapshots", () => {
    expect(ServerConfig.safeParse(baseline).success).toBe(true);
    expect(ServerConfigStreamSnapshotEvent.safeParse(snapshot(baseline)).success).toBe(true);
    for (const lastEventLoopStall of [
      null,
      false,
      1,
      "stall",
      [],
      {},
      { ...stall, detectedAt: 1 },
      { ...stall, detectedAt: undefined },
      { ...stall, durationMs: -1 },
      { ...stall, durationMs: 0.5 },
      { ...stall, durationMs: "1" },
      { ...stall, durationMs: undefined },
      { ...stall, cpuCount: 0 },
      { ...stall, cpuCount: 1.5 },
      { ...stall, cpuCount: "1" },
      { ...stall, cpuCount: undefined },
      { ...stall, loadAverage: null },
      { ...stall, loadAverage: "1" },
    ]) {
      const value = { ...baseline, lastEventLoopStall };
      expect(ServerConfig.safeParse(value).success).toBe(false);
      expect(ServerConfigStreamSnapshotEvent.safeParse(snapshot(value)).success).toBe(false);
    }
  });
});
