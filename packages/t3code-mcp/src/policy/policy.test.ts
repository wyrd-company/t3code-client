// ---
// relationships:
//   verifies: mcp
// ---
import { describe, expect, it } from "vite-plus/test";
import { config } from "../../test/support/fakes.ts";
import { assertAllowed, boundedMode, exposed, matches } from "./policy.ts";
import { allTools } from "../server.ts";
describe("tool policy", () => {
  it("limits exposure to the global allow list", () => {
    expect(
      exposed({ name: "thread_send", readOnly: false }, config({ allowTools: ["server_*"] })),
    ).toBe(false);
  });
  it("matches only literal text and star globs", () => {
    expect(matches("thread_read", ["thread_*"])).toBe(true);
    expect(matches("thread_read", ["thread.read"])).toBe(false);
    expect(matches("a[b]", ["a[b]"])).toBe(true);
  });
  it("requires exact approval opt-in and lets deny win", () => {
    const approval = allTools.find((t) => t.name === "approval_respond")!;
    expect(exposed(approval, config())).toBe(false);
    expect(exposed(approval, config({ allowTools: ["approval_respond"] }))).toBe(true);
    expect(
      exposed(approval, config({ allowTools: ["approval_respond"], denyTools: ["*_respond"] })),
    ).toBe(false);
    expect(exposed(approval, config({ allowTools: ["approval_respond"], readOnly: true }))).toBe(
      false,
    );
  });
  it("exposes exactly the read-only tools", () => {
    expect(
      allTools
        .filter((t) => exposed(t, config({ readOnly: true })))
        .map((t) => t.name)
        .sort(),
    ).toEqual(
      [
        "server_list",
        "server_capabilities",
        "project_list",
        "thread_list",
        "thread_read",
        "thread_wait",
        "pending_request_list",
      ].sort(),
    );
  });
  it("applies per-server filters and mode caps", () => {
    expect(() => assertAllowed("thread_send", { denyTools: ["thread_*"] })).toThrow("denied");
    expect(() => assertAllowed("thread_read", { allowTools: ["server_*"] })).toThrow("denied");
    expect(boundedMode(undefined, { maxRuntimeMode: "auto-accept-edits" })).toBe(
      "auto-accept-edits",
    );
    expect(boundedMode("approval-required", { maxRuntimeMode: "auto" })).toBe("approval-required");
    expect(() => boundedMode("full-access", { maxRuntimeMode: "auto" })).toThrow("exceeds");
    expect(() => boundedMode("unknown", { maxRuntimeMode: "auto" })).toThrow("not covered");
  });
});
