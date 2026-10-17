// ---
// relationships:
//   verifies: documentation
//   references: command-line, library
// ---
import * as NodeFS from "node:fs";
import { expect, it } from "vite-plus/test";

const docs = new URL("../../docs/", import.meta.url);
function read(path: string): string {
  return NodeFS.readFileSync(new URL(path, docs), "utf8");
}
function prose(text: string): string {
  return text
    .replace(/\]\([^)]+\)/gu, "]")
    .replace(/\s+/gu, " ")
    .trim();
}

it("publishes the entire generated library reference with one canonical generator input", () => {
  const api = read("api.md").replace(/^---\n[\s\S]*?\n---\n/u, "");
  expect(prose(read("library-reference.md"))).toContain(prose(api));
  expect(read("library-reference.md")).toContain("from docs/api.md; edit the source.");
});

it("builds and packs exactly the canonical root command surface", () => {
  const packed = NodeFS.readFileSync(
    new URL("../../packages/t3code-cli/commandSurface.json", import.meta.url),
    "utf8",
  );
  expect(JSON.parse(packed)).toEqual(JSON.parse(read("specifications/cli-surface.json")));
});
