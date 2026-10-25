// ---
// relationships:
//   verifies: library-facades
// ---
import { describe, expect, expectTypeOf, it } from "vite-plus/test";
import type { ServerApi } from "../index.ts";
import type { RpcMethods } from "../rpc/registry.ts";
import type { RpcSuccess } from "../rpc/spec.ts";
import type {
  ServerConfigStreamProviderStatusesEvent,
  ServerConfigStreamSnapshotEvent,
} from "./server.ts";
import { ServerProviderWorkspaceSnapshot } from "./provider.ts";

const snapshot = {
  cwd: "/sample/workspace",
  checkedAt: "2026-01-01T00:00:00.000Z",
  slashCommands: [],
  skills: [],
};

describe("optional workspace slash-command discovery state", () => {
  it("exposes optional boolean through schema, registry, facade and config stream", () => {
    type Expected = boolean | undefined;
    expectTypeOf<
      ServerProviderWorkspaceSnapshot["slashCommandsPending"]
    >().toEqualTypeOf<Expected>();
    type ConfigSnapshot = NonNullable<
      RpcSuccess<RpcMethods, "server.getConfig">["providers"][number]["workspaceSnapshots"]
    >[number];
    expectTypeOf<ConfigSnapshot["slashCommandsPending"]>().toEqualTypeOf<Expected>();
    type PublicSnapshot = NonNullable<
      Awaited<ReturnType<ServerApi["providers"]>>[number]["workspaceSnapshots"]
    >[number];
    expectTypeOf<PublicSnapshot["slashCommandsPending"]>().toEqualTypeOf<Expected>();
    type StreamSnapshot = NonNullable<
      ServerConfigStreamSnapshotEvent["config"]["providers"][number]["workspaceSnapshots"]
    >[number];
    type StreamUpdate = NonNullable<
      ServerConfigStreamProviderStatusesEvent["payload"]["providers"][number]["workspaceSnapshots"]
    >[number];
    expectTypeOf<StreamSnapshot["slashCommandsPending"]>().toEqualTypeOf<Expected>();
    expectTypeOf<StreamUpdate["slashCommandsPending"]>().toEqualTypeOf<Expected>();
  });

  it("preserves omission and explicit true and false without inference", () => {
    expect(ServerProviderWorkspaceSnapshot.parse(snapshot)).toEqual(snapshot);
    for (const slashCommandsPending of [true, false]) {
      const input = { ...snapshot, slashCommandsPending, future: "preserved" };
      expect(ServerProviderWorkspaceSnapshot.parse(input)).toEqual(input);
    }
  });

  it("rejects non-boolean pending state on an otherwise valid snapshot", () => {
    expect(ServerProviderWorkspaceSnapshot.safeParse(snapshot).success).toBe(true);
    for (const slashCommandsPending of [null, 0, 1, "true", "false", [], {}]) {
      expect(
        ServerProviderWorkspaceSnapshot.safeParse({ ...snapshot, slashCommandsPending }).success,
      ).toBe(false);
    }
  });
});
