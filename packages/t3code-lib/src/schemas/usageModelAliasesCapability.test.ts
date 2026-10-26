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

describe("optional usage-model-alias capability", () => {
  it("exposes optional boolean through schema, registry, facade and config snapshot", () => {
    type Expected = boolean | undefined;
    expectTypeOf<ExecutionEnvironmentCapabilities["usageModelAliases"]>().toEqualTypeOf<Expected>();
    type Environment = Awaited<ReturnType<ServerApi["environment"]>>;
    type Config = Awaited<ReturnType<ServerApi["getConfig"]>>;
    type WireConfig = RpcSuccess<RpcMethods, "server.getConfig">;
    type Snapshot = ServerConfigStreamSnapshotEvent["config"];
    expectTypeOf<Environment["capabilities"]["usageModelAliases"]>().toEqualTypeOf<Expected>();
    expectTypeOf<
      Config["environment"]["capabilities"]["usageModelAliases"]
    >().toEqualTypeOf<Expected>();
    expectTypeOf<
      WireConfig["environment"]["capabilities"]["usageModelAliases"]
    >().toEqualTypeOf<Expected>();
    expectTypeOf<
      Snapshot["environment"]["capabilities"]["usageModelAliases"]
    >().toEqualTypeOf<Expected>();
  });

  it("preserves omission, explicit booleans and unknown fields", () => {
    expect(ExecutionEnvironmentDescriptor.parse(descriptor)).toEqual(descriptor);
    for (const usageModelAliases of [true, false]) {
      const capabilities = { ...descriptor.capabilities, usageModelAliases, future: "preserved" };
      expect(ExecutionEnvironmentCapabilities.parse(capabilities)).toEqual(capabilities);
      expect(
        ExecutionEnvironmentDescriptor.parse({ ...descriptor, capabilities }).capabilities,
      ).toEqual(capabilities);
    }
  });

  it("rejects non-boolean usage-model-alias capability on an otherwise valid descriptor", () => {
    expect(ExecutionEnvironmentDescriptor.safeParse(descriptor).success).toBe(true);
    for (const usageModelAliases of [null, 0, 1, "true", "false", [], {}]) {
      const capabilities = { ...descriptor.capabilities, usageModelAliases };
      expect(ExecutionEnvironmentCapabilities.safeParse(capabilities).success).toBe(false);
      expect(
        ExecutionEnvironmentDescriptor.safeParse({ ...descriptor, capabilities }).success,
      ).toBe(false);
    }
  });
});
