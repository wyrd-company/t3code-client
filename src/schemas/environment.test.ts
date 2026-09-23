import { describe, expect, it } from "vite-plus/test";

import { ExecutionEnvironmentDescriptor } from "./environment.ts";

describe("ExecutionEnvironmentDescriptor", () => {
  it("decodes a realistic descriptor and preserves new capabilities", () => {
    expect(
      ExecutionEnvironmentDescriptor.parse({
        environmentId: "environment-1",
        label: "Sample environment",
        platform: { os: "linux", arch: "arm64", machine: "server" },
        serverVersion: "1.2.3",
        capabilities: { repositoryIdentity: true, futureCapability: { enabled: true } },
      }),
    ).toMatchObject({ capabilities: { futureCapability: { enabled: true } } });
  });
});
