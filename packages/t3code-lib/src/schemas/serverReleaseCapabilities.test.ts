// ---
// relationships:
//   verifies: library-facades
// ---
import { describe, expect, expectTypeOf, it } from "vite-plus/test";
import type { ServerApi } from "../index.ts";
import { ExecutionEnvironmentCapabilities, ExecutionEnvironmentDescriptor } from "./environment.ts";
import type { ServerConfigStreamSnapshotEvent } from "./server.ts";

const descriptor = {
  environmentId: "sample-environment",
  label: "Sample",
  platform: { os: "linux", arch: "x64" },
  serverVersion: "0.1.2",
  capabilities: { repositoryIdentity: true },
};

const flags = ["npmReleaseLookup", "triage", "providerWorkspaceSnapshotsOnDemand"] as const;

describe("optional server release, triage and on-demand snapshot capabilities", () => {
  it("exposes optional booleans through schema, facade and config snapshot", () => {
    type Expected = boolean | undefined;
    type Environment = Awaited<ReturnType<ServerApi["environment"]>>["capabilities"];
    type Config = Awaited<ReturnType<ServerApi["getConfig"]>>["environment"]["capabilities"];
    type Snapshot = ServerConfigStreamSnapshotEvent["config"]["environment"]["capabilities"];
    expectTypeOf<ExecutionEnvironmentCapabilities["triage"]>().toEqualTypeOf<Expected>();
    expectTypeOf<Environment["npmReleaseLookup"]>().toEqualTypeOf<Expected>();
    expectTypeOf<Config["triage"]>().toEqualTypeOf<Expected>();
    expectTypeOf<Snapshot["providerWorkspaceSnapshotsOnDemand"]>().toEqualTypeOf<Expected>();
  });

  it.each(flags)("preserves omission, booleans and unknown fields for %s", (flag) => {
    expect(ExecutionEnvironmentDescriptor.parse(descriptor)).toEqual(descriptor);
    for (const value of [true, false]) {
      const capabilities = { ...descriptor.capabilities, [flag]: value, future: "preserved" };
      expect(ExecutionEnvironmentCapabilities.parse(capabilities)).toEqual(capabilities);
    }
  });

  it.each(flags)("rejects non-boolean %s on an otherwise valid descriptor", (flag) => {
    for (const value of [null, 0, 1, "true", [], {}]) {
      const capabilities = { ...descriptor.capabilities, [flag]: value };
      expect(
        ExecutionEnvironmentDescriptor.safeParse({ ...descriptor, capabilities }).success,
      ).toBe(false);
    }
  });
});
