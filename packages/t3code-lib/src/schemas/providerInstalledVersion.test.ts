// ---
// relationships:
//   verifies: library-facades
// ---
import { describe, expect, expectTypeOf, it } from "vite-plus/test";
import type { ServerApi } from "../index.ts";
import type { RpcMethods } from "../rpc/registry.ts";
import type { RpcSuccess } from "../rpc/spec.ts";
import { ServerProvider, ServerProviders } from "./provider.ts";

const provider = {
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
};

describe("optional provider installed version", () => {
  it("exposes a nullable optional string through schema, registry and facade", () => {
    expectTypeOf<ServerProvider["installedVersion"]>().toEqualTypeOf<string | null | undefined>();
    expectTypeOf<
      RpcSuccess<RpcMethods, "server.getConfig">["providers"][number]["installedVersion"]
    >().toEqualTypeOf<string | null | undefined>();
    expectTypeOf<
      Awaited<ReturnType<ServerApi["providers"]>>[number]["installedVersion"]
    >().toEqualTypeOf<string | null | undefined>();
  });

  it("preserves omission, null, versions and future fields", () => {
    for (const value of [
      provider,
      { ...provider, installedVersion: null },
      { ...provider, installedVersion: "1.2.3", future: true },
    ]) {
      expect(ServerProvider.parse(value)).toEqual(value);
      expect(ServerProviders.parse([value])).toEqual([value]);
    }
    expect(
      ServerProvider.parse({ ...provider, installedVersion: " 1.2.3 " }).installedVersion,
    ).toBe("1.2.3");
  });

  it("rejects malformed installed versions on otherwise valid providers", () => {
    expect(ServerProvider.safeParse(provider).success).toBe(true);
    for (const installedVersion of [true, 1, {}, [], "", "   "]) {
      expect(ServerProvider.safeParse({ ...provider, installedVersion }).success).toBe(false);
    }
  });
});
