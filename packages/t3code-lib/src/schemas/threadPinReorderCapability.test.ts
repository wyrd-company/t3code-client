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

describe("optional thread-pin-reorder capability", () => {
  it("exposes optional boolean through schema, registry, facade and config snapshot", () => {
    type Expected = boolean | undefined;
    expectTypeOf<ExecutionEnvironmentCapabilities["threadPinReorder"]>().toEqualTypeOf<Expected>();
    type Environment = Awaited<ReturnType<ServerApi["environment"]>>;
    type Config = Awaited<ReturnType<ServerApi["getConfig"]>>;
    type WireConfig = RpcSuccess<RpcMethods, "server.getConfig">;
    type Snapshot = ServerConfigStreamSnapshotEvent["config"];
    expectTypeOf<Environment["capabilities"]["threadPinReorder"]>().toEqualTypeOf<Expected>();
    expectTypeOf<
      Config["environment"]["capabilities"]["threadPinReorder"]
    >().toEqualTypeOf<Expected>();
    expectTypeOf<
      WireConfig["environment"]["capabilities"]["threadPinReorder"]
    >().toEqualTypeOf<Expected>();
    expectTypeOf<
      Snapshot["environment"]["capabilities"]["threadPinReorder"]
    >().toEqualTypeOf<Expected>();
  });

  it("preserves omission, explicit booleans and unknown fields", () => {
    expect(ExecutionEnvironmentDescriptor.parse(descriptor)).toEqual(descriptor);
    for (const threadPinReorder of [true, false]) {
      const capabilities = { ...descriptor.capabilities, threadPinReorder, future: "preserved" };
      expect(ExecutionEnvironmentCapabilities.parse(capabilities)).toEqual(capabilities);
      expect(
        ExecutionEnvironmentDescriptor.parse({ ...descriptor, capabilities }).capabilities,
      ).toEqual(capabilities);
    }
  });

  it("rejects non-boolean thread-pin-reorder capability on an otherwise valid descriptor", () => {
    expect(ExecutionEnvironmentDescriptor.safeParse(descriptor).success).toBe(true);
    for (const threadPinReorder of [null, 0, 1, "true", "false", [], {}]) {
      const capabilities = { ...descriptor.capabilities, threadPinReorder };
      expect(ExecutionEnvironmentCapabilities.safeParse(capabilities).success).toBe(false);
      expect(
        ExecutionEnvironmentDescriptor.safeParse({ ...descriptor, capabilities }).success,
      ).toBe(false);
    }
  });
});
