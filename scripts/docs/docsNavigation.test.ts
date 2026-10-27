// ---
// relationships:
//   verifies: documentation
// ---
import * as NodeFSP from "node:fs/promises";
import * as NodeOS from "node:os";
import * as NodePath from "node:path";
import { afterEach, expect, it } from "vite-plus/test";
import { parse } from "yaml";
import { syncNavigation } from "../../packages/t3code-cli/scripts/docsNavigation.mjs";

const roots: string[] = [];
afterEach(async () => {
  for (const root of roots.splice(0)) await NodeFSP.rm(root, { recursive: true, force: true });
});
const pages = [
  { filename: "library-reference.md", group: "Library" },
  { filename: "library-client.md", group: "Library" },
  { filename: "library-threads.md", group: "Threads" },
];
async function fixture() {
  const root = await NodeFSP.mkdtemp(NodePath.join(NodeOS.tmpdir(), "sample-docs-nav-"));
  roots.push(root);
  const path = NodePath.join(root, "docs.yml");
  await NodeFSP.writeFile(
    path,
    "# Keep this comment.\nschemaVersion: 1\nproducts:\n  t3c:\n    version: 0.1.0\n    nav:\n      - section: Reference\n        groups: [{group: Commands, pages: [commands]}]\n  t3mcp:\n    version: 0.0.0\n",
  );
  return path;
}
it("generates the Developers groups and preserves authored navigation and versions", async () => {
  const path = await fixture();
  await syncNavigation(path, pages);
  const source = await NodeFSP.readFile(path, "utf8");
  expect(source).toContain("# Keep this comment.");
  const manifest = parse(source);
  expect(manifest.products.t3c.version).toBe("0.1.0");
  expect(manifest.products.t3mcp).toEqual({ version: "0.0.0" });
  expect(manifest.products.t3c.nav).toEqual([
    { section: "Reference", groups: [{ group: "Commands", pages: ["commands"] }] },
    {
      section: "Developers",
      groups: [
        { group: "Library", pages: ["library-reference", "library-client"] },
        { group: "Threads", pages: ["library-threads"] },
      ],
    },
  ]);
  await expect(syncNavigation(path, pages, true)).resolves.toBeUndefined();
  expect(await NodeFSP.readFile(path, "utf8")).toBe(source);
});
it("check mode detects missing and stale page navigation without writing", async () => {
  const path = await fixture();
  const original = await NodeFSP.readFile(path, "utf8");
  await expect(syncNavigation(path, pages, true)).rejects.toThrow("Regenerate Developers");
  expect(await NodeFSP.readFile(path, "utf8")).toBe(original);
  await syncNavigation(path, pages);
  const generated = await NodeFSP.readFile(path, "utf8");
  const expanded = [...pages, { filename: "library-threads-2.md", group: "Threads" }];
  await expect(syncNavigation(path, expanded, true)).rejects.toThrow("Regenerate Developers");
  expect(await NodeFSP.readFile(path, "utf8")).toBe(generated);
  await syncNavigation(path, expanded);
  await expect(syncNavigation(path, expanded, true)).resolves.toBeUndefined();
  expect(parse(await NodeFSP.readFile(path, "utf8")).products.t3c.nav[1].groups[1].pages).toEqual([
    "library-threads",
    "library-threads-2",
  ]);
});
it("refuses malformed metadata rather than replacing it", async () => {
  const path = await fixture();
  for (const source of [
    "products: [",
    "products: {t3c: {nav: {}}}",
    "products: {t3c: {nav: [{section: Developers}, {section: Developers}]}} ",
  ]) {
    await NodeFSP.writeFile(path, source);
    await expect(syncNavigation(path, pages)).rejects.toThrow();
    expect(await NodeFSP.readFile(path, "utf8")).toBe(source);
  }
});
