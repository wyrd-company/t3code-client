// ---
// relationships:
//   verifies: command-line, releasing
// ---
import * as NodeFS from "node:fs";
import * as NodePath from "node:path";
import { expect, it } from "vite-plus/test";
const root = NodePath.resolve(import.meta.dirname, "../../docs");
const published = NodeFS.readdirSync(root).filter(
  (name) =>
    name.endsWith(".md") &&
    /^docs: true$/mu.test(NodeFS.readFileSync(NodePath.join(root, name), "utf8")),
);
it("publishes the complete CLI navigation and generated library page with unique ordering", () => {
  expect(published.sort()).toEqual([
    "auth.md",
    "commands.md",
    "dagu.md",
    "index.md",
    "library.md",
    "policy.md",
  ]);
  const orders = published.map((name) => {
    const page = NodeFS.readFileSync(NodePath.join(root, name), "utf8");
    expect(page).toMatch(/^title: .+$/mu);
    return page.match(/^order: (\d+)$/mu)?.[1];
  });
  expect(orders).not.toContain(undefined);
  expect(new Set(orders).size).toBe(published.length);
  expect(Object.fromEntries(published.map((name, index) => [name, orders[index]]))).toEqual({
    "auth.md": "2",
    "commands.md": "3",
    "dagu.md": "5",
    "index.md": "1",
    "library.md": "6",
    "policy.md": "4",
  });
  expect(NodeFS.readFileSync(NodePath.join(root, "library.md"), "utf8")).toContain(
    "T3StorageError",
  );
});
it("resolves every local published-page link and demo asset", () => {
  for (const name of published) {
    const page = NodeFS.readFileSync(NodePath.join(root, name), "utf8");
    for (const [, href] of page.matchAll(/\]\(([^)]+)\)/gu)) {
      if (!href || /^(?:[a-z]+:|#)/u.test(href)) continue;
      const path = NodePath.resolve(root, href.split("#")[0]!);
      expect(NodeFS.existsSync(path), `${name}: ${href}`).toBe(true);
    }
  }
  const manifest = NodeFS.readFileSync(NodePath.join(root, "docs.yml"), "utf8");
  expect(manifest).toContain("assets:\n  - assets/demo.gif");
  expect(
    NodeFS.readFileSync(NodePath.join(root, "assets/demo.gif")).subarray(0, 3).toString(),
  ).toBe("GIF");
});
