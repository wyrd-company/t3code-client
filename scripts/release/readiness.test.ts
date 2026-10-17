// ---
// relationships:
//   verifies: releasing
// ---
import * as NodeFS from "node:fs";
import { afterEach, describe, expect, it } from "vite-plus/test";
import { fixture, manifest, run, write } from "./testSupport.ts";

const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0)) NodeFS.rmSync(root, { recursive: true, force: true });
});
function ready(unit: string, extra: Record<string, unknown> = {}) {
  const root = fixture();
  roots.push(root);
  manifest(root, unit, extra);
  write(root, "plan.json", JSON.stringify({ tags: [{ release_unit: unit }] }));
  return run(root, "verify-readiness.sh", ["plan.json"]);
}
describe("pre-apply package readiness", () => {
  for (const unit of ["t3code-lib", "t3code-cli"]) {
    it(`accepts public ${unit} before apply`, () => {
      expect(ready(unit).status).toBe(0);
    });
    it(`rejects private ${unit} before apply`, () => {
      const result = ready(unit, { private: true });
      expect(result.stderr).toContain("is private");
      expect(result.status).not.toBe(0);
    });
    it(`rejects mismatched ${unit} identity before apply`, () => {
      const result = ready(unit, { name: "@example/other" });
      expect(result.stderr).toContain("Package identity must be");
      expect(result.status).not.toBe(0);
    });
  }
  it("rejects unsupported units before apply", () => {
    expect(ready("other").status).not.toBe(0);
  });
});
