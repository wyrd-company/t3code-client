// ---
// relationships:
//   verifies: library-facades
// ---
import { describe, expect, expectTypeOf, it } from "vite-plus/test";
import type { ServerApi } from "../index.ts";
import type { RpcMethods } from "../rpc/registry.ts";
import type { RpcSuccess } from "../rpc/spec.ts";
import { type ProviderOptionDescriptor, ServerProviderWorkspaceSnapshot } from "./provider.ts";

const snapshot = {
  cwd: "/sample/workspace",
  checkedAt: "2026-01-01T00:00:00.000Z",
  slashCommands: [],
  skills: [],
};

describe("optional provider workspace option descriptors", () => {
  it("exposes optional descriptor arrays through schema, registry and facade", () => {
    type Expected = ProviderOptionDescriptor[] | undefined;
    expectTypeOf<ServerProviderWorkspaceSnapshot["optionDescriptors"]>().toEqualTypeOf<Expected>();
    type ConfigSnapshot = NonNullable<
      RpcSuccess<RpcMethods, "server.getConfig">["providers"][number]["workspaceSnapshots"]
    >[number];
    expectTypeOf<ConfigSnapshot["optionDescriptors"]>().toEqualTypeOf<Expected>();
    type PublicSnapshot = NonNullable<
      Awaited<ReturnType<ServerApi["providers"]>>[number]["workspaceSnapshots"]
    >[number];
    expectTypeOf<PublicSnapshot["optionDescriptors"]>().toEqualTypeOf<Expected>();
  });

  it("preserves omission, empty arrays, known descriptors and future variants", () => {
    expect(ServerProviderWorkspaceSnapshot.parse(snapshot)).toEqual(snapshot);
    expect(ServerProviderWorkspaceSnapshot.parse({ ...snapshot, optionDescriptors: [] })).toEqual({
      ...snapshot,
      optionDescriptors: [],
    });
    const known = [
      { type: "boolean", id: "sample-toggle", label: "Sample toggle", currentValue: false },
      {
        type: "select",
        id: "sample-choice",
        label: "Sample choice",
        options: [{ id: "first", label: "First", future: true }],
        currentValue: "first",
        future: true,
      },
    ];
    const future = { type: "future", id: "sample-future", payload: true };
    expect(
      ServerProviderWorkspaceSnapshot.parse({
        ...snapshot,
        optionDescriptors: [...known, future],
        future: true,
      }),
    ).toEqual({
      ...snapshot,
      optionDescriptors: [...known, { unknown: true, raw: future }],
      future: true,
    });
  });

  it("rejects malformed descriptor arrays on otherwise valid snapshots", () => {
    expect(ServerProviderWorkspaceSnapshot.safeParse(snapshot).success).toBe(true);
    for (const optionDescriptors of [
      null,
      true,
      1,
      "options",
      {},
      [null],
      [{ type: "boolean", id: "sample", label: "Sample", currentValue: "true" }],
      [{ type: "select", id: "sample", label: "Sample", options: false }],
    ]) {
      expect(
        ServerProviderWorkspaceSnapshot.safeParse({ ...snapshot, optionDescriptors }).success,
      ).toBe(false);
    }
  });
});
