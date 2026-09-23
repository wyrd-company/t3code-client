import { describe, expect, it } from "vite-plus/test";

import { EnvironmentHttpCommonError } from "./httpErrors.ts";

describe("HTTP error schemas", () => {
  it("discriminates tagged environment errors", () => {
    expect(
      EnvironmentHttpCommonError.parse({
        _tag: "EnvironmentScopeRequiredError",
        code: "insufficient_scope",
        requiredScope: "orchestration:operate",
        traceId: "trace-1",
      }),
    ).toMatchObject({ code: "insufficient_scope" });
  });
});
