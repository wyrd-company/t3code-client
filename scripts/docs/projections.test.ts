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
const reference = "user/t3c/library-reference.md";
function prose(text: string): string {
  return text
    .replace(/\]\([^)]+\)/gu, "]")
    .replace(/\s+/gu, " ")
    .trim();
}

it("publishes the entire generated library reference with one canonical generator input", () => {
  const api = read("api.md").replace(/^---\n[\s\S]*?\n---\n/u, "");
  expect(prose(read(reference))).toContain(prose(api));
  expect(read(reference)).toContain("from docs/api.md; edit the source.");
});
