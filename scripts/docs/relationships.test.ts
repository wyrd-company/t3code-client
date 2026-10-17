// ---
// relationships:
//   verifies: documentation
// ---
import * as NodeChildProcess from "node:child_process";
import * as NodeFS from "node:fs";
import * as NodePath from "node:path";
import { expect, it } from "vite-plus/test";
import { artifact, relationshipErrors } from "./relationships.ts";

const root = NodePath.resolve(import.meta.dirname, "../..");
const paths = NodeChildProcess.execFileSync("git", ["ls-files", "-z"], {
  cwd: root,
  encoding: "utf8",
})
  .split("\0")
  .filter(
    (path) =>
      path &&
      NodeFS.existsSync(NodePath.join(root, path)) &&
      !NodeFS.lstatSync(NodePath.join(root, path)).isSymbolicLink(),
  );
const artifacts = paths.map((path) =>
  artifact(
    path,
    /\.(?:md|ts|mjs|ya?ml|json)$/u.test(path)
      ? NodeFS.readFileSync(NodePath.join(root, path), "utf8")
      : "",
  ),
);

it("resolves every authored relationship to one actual repository identity", () => {
  expect(relationshipErrors(artifacts)).toEqual([]);
});
it("rejects retired targets, ambiguous stems and incorrect declared type ranges", () => {
  const reference = artifact(
    "sample.ts",
    "// ---\n// relationships:\n//   references: missing\n// ---\n",
  );
  expect(relationshipErrors([reference])).toEqual([
    "sample.ts: references missing resolves to 0 identities ()",
  ]);
  reference.relationships = { references: "shared" };
  expect(
    relationshipErrors([
      reference,
      artifact("docs/shared.md", ""),
      artifact("docs/technical-designs/shared.yml", ""),
    ])[0],
  ).toContain("resolves to 2 identities");
  const design = artifact(
    "docs/technical-designs/sample.yml",
    "$schema: https://refinery.systems/ontology/technical-design\nrelationships:\n  related-to: guide\n",
  );
  expect(relationshipErrors([design, artifact("docs/guide.md", "")])).toEqual([
    "docs/technical-designs/sample.yml: related-to guide must name a technical design",
  ]);
});
