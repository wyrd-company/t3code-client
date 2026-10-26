// ---
// relationships:
//   verifies: library-facades
// ---
import { describe, expect, expectTypeOf, it } from "vite-plus/test";
import type { ServerApi } from "../index.ts";
import type { RpcMethods } from "../rpc/registry.ts";
import type { RpcSuccess } from "../rpc/spec.ts";
import { ExecutionEnvironmentCapabilities, ExecutionEnvironmentDescriptor } from "./environment.ts";
import type { ServerConfigStreamSnapshotEvent } from "./server.ts";

const descriptor = {
  environmentId: "sample-environment",
  label: "Sample",
  platform: { os: "linux", arch: "x64" },
  serverVersion: "0.1.2",
  capabilities: { repositoryIdentity: true },
};

describe("optional server self-update capability", () => {
  it("exposes optional growing literal through schema, registry, facade and config snapshot", () => {
    type Expected = "boot-service" | "respawn" | "desktop-managed" | (string & {}) | undefined;
    expectTypeOf<ExecutionEnvironmentCapabilities["serverSelfUpdate"]>().toEqualTypeOf<Expected>();
    type Environment = Awaited<ReturnType<ServerApi["environment"]>>;
    type Config = Awaited<ReturnType<ServerApi["getConfig"]>>;
    type WireConfig = RpcSuccess<RpcMethods, "server.getConfig">;
    type Snapshot = ServerConfigStreamSnapshotEvent["config"];
    expectTypeOf<Environment["capabilities"]["serverSelfUpdate"]>().toEqualTypeOf<Expected>();
    expectTypeOf<
      Config["environment"]["capabilities"]["serverSelfUpdate"]
    >().toEqualTypeOf<Expected>();
    expectTypeOf<
      WireConfig["environment"]["capabilities"]["serverSelfUpdate"]
    >().toEqualTypeOf<Expected>();
    expectTypeOf<
      Snapshot["environment"]["capabilities"]["serverSelfUpdate"]
    >().toEqualTypeOf<Expected>();
  });

  it("preserves omission, all known variants, unknown strings and unknown fields", () => {
    expect(ExecutionEnvironmentDescriptor.parse(descriptor)).toEqual(descriptor);
    for (const serverSelfUpdate of [
      "boot-service",
      "respawn",
      "desktop-managed",
      "future-update-path",
    ]) {
      const capabilities = {
        ...descriptor.capabilities,
        serverSelfUpdate,
        future: "preserved",
      };
      expect(ExecutionEnvironmentCapabilities.parse(capabilities)).toEqual(capabilities);
      expect(
        ExecutionEnvironmentDescriptor.parse({ ...descriptor, capabilities }).capabilities,
      ).toEqual(capabilities);
    }
  });

  it("rejects non-string server self-update capability on an otherwise valid descriptor", () => {
    expect(ExecutionEnvironmentDescriptor.safeParse(descriptor).success).toBe(true);
    for (const serverSelfUpdate of [null, false, true, 0, 1, [], {}]) {
      const capabilities = { ...descriptor.capabilities, serverSelfUpdate };
      expect(ExecutionEnvironmentCapabilities.safeParse(capabilities).success).toBe(false);
      expect(
        ExecutionEnvironmentDescriptor.safeParse({ ...descriptor, capabilities }).success,
      ).toBe(false);
    }
  });
});
