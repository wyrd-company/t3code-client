// ---
// relationships:
//   verifies: releasing
// ---
import * as NodeFS from "node:fs";
import { afterEach, describe, expect, it } from "vite-plus/test";
import { fixture, run, write } from "./testSupport.ts";

const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0)) NodeFS.rmSync(root, { recursive: true, force: true });
});

function plan(names: string[]) {
  const root = fixture();
  roots.push(root);
  write(
    root,
    "plan.json",
    JSON.stringify({ tags: names.map((name) => ({ name, release_unit: name.split("@")[0] })) }),
  );
  return root;
}

describe("release selection", () => {
  it("accepts an independently selected unit", () => {
    const root = plan(["t3code-lib@0.1.0"]);
    expect(run(root, "verify-plan.sh", ["t3code-lib@0.1.0", "plan.json"]).status).toBe(0);
  });
  it("accepts the complete expected set regardless of order", () => {
    const root = plan(["t3code-cli@0.1.0", "t3code-lib@0.1.0"]);
    expect(
      run(root, "verify-plan.sh", ["t3code-lib@0.1.0 t3code-cli@0.1.0", "plan.json"]).status,
    ).toBe(0);
  });
  it("rejects an unrelated unit in the whole plan", () => {
    const root = plan(["t3code-lib@0.1.0", "t3code-cli@0.1.0"]);
    expect(run(root, "verify-plan.sh", ["t3code-lib@0.1.0", "plan.json"]).status).not.toBe(0);
  });
  it("rejects missing releases, version disagreement, duplicates and retired identity", () => {
    const root = plan(["t3code-lib@0.1.0"]);
    for (const expected of [
      "t3code-cli@0.1.0",
      "t3code-lib@0.2.0",
      "t3code-lib@0.1.0 t3code-lib@0.1.0",
      "t3code-client@0.1.0",
    ]) {
      expect(run(root, "verify-plan.sh", [expected, "plan.json"]).status).not.toBe(0);
    }
    write(root, "plan.json", '{"tags":[]}');
    expect(run(root, "verify-plan.sh", ["t3code-lib@0.1.0", "plan.json"]).status).not.toBe(0);
  });
  it("rejects retired identity and duplicates even when the supplied set matches", () => {
    for (const names of [["t3code-client@0.1.0"], ["t3code-lib@0.1.0", "t3code-lib@0.1.0"]]) {
      const root = plan(names);
      expect(run(root, "verify-plan.sh", [names.join(" "), "plan.json"]).status).not.toBe(0);
    }
  });
  it("rejects a record whose unit disagrees", () => {
    const root = plan([]);
    write(root, "plan.json", '{"tags":[{"name":"t3code-lib@0.1.0","release_unit":"t3code-cli"}]}');
    expect(run(root, "verify-plan.sh", ["t3code-lib@0.1.0", "plan.json"]).status).not.toBe(0);
  });
});
