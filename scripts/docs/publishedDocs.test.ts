// ---
// relationships:
//   verifies: command-line, releasing
// ---
import * as NodeFS from "node:fs";
import * as NodePath from "node:path";
import { parse } from "yaml";
import { expect, it } from "vite-plus/test";
const user = NodePath.resolve(import.meta.dirname, "../../docs/user");
const root = NodePath.join(user, "t3c");
const published = NodeFS.readdirSync(user, { recursive: true })
  .map(String)
  .filter((name) => name.endsWith(".md"));
const read = (path: string) => NodeFS.readFileSync(NodePath.join(user, path), "utf8");
it("publishes the complete CLI navigation and generated library page with unique ordering", () => {
  expect(published.sort()).toEqual([
    "t3c/auth.md",
    "t3c/commands.md",
    "t3c/dagu.md",
    "t3c/index.md",
    "t3c/library-reference.md",
    "t3c/policy.md",
  ]);
  const orders = published.map((name) => {
    const page = read(name);
    expect(page, name).toMatch(/^title: .+$/mu);
    expect(page, name).toMatch(/^product: t3c$/mu);
    expect(page, name).not.toMatch(/^docs: true$/mu);
    return page.match(/^order: (\d+)$/mu)?.[1];
  });
  expect(orders).not.toContain(undefined);
  expect(new Set(orders).size).toBe(published.length);
  expect(Object.fromEntries(published.map((name, index) => [name, orders[index]]))).toEqual({
    "t3c/auth.md": "2",
    "t3c/commands.md": "3",
    "t3c/dagu.md": "5",
    "t3c/index.md": "1",
    "t3c/library-reference.md": "6",
    "t3c/policy.md": "4",
  });
  expect(read("t3c/library-reference.md")).toContain("T3StorageError");
});
it("resolves every local published-page link and demo asset", () => {
  for (const name of published) {
    const page = read(name);
    for (const [, href] of page.matchAll(/\]\(([^)]+)\)/gu)) {
      if (!href || /^(?:[a-z]+:|#)/u.test(href)) continue;
      const path = NodePath.resolve(
        NodePath.dirname(NodePath.join(user, name)),
        href.split("#")[0]!,
      );
      expect(NodeFS.existsSync(path), `${name}: ${href}`).toBe(true);
    }
  }
  const manifest = parse(read("docs.yml")) as {
    assets: string[];
    products: Record<
      string,
      { media: { src: string }[]; nav: { groups: { pages: string[] }[] }[] }
    >;
  };
  expect(manifest.assets).toEqual(["assets/demo.gif"]);
  expect(Object.keys(manifest.products)).toEqual(["t3c"]);
  expect(manifest.products["t3c"]!.media.map((item) => item.src)).toEqual(manifest.assets);
  expect(
    NodeFS.readFileSync(NodePath.join(root, manifest.assets[0]!)).subarray(0, 3).toString(),
  ).toBe("GIF");
});
it("lists every published page once in the navigation", () => {
  const manifest = parse(read("docs.yml")) as {
    products: Record<string, { nav: { groups: { pages: string[] }[] }[] }>;
  };
  const slugs = manifest.products["t3c"]!.nav.flatMap((section) =>
    section.groups.flatMap((group) => group.pages),
  );
  expect(slugs.sort()).toEqual(published.map((name) => NodePath.basename(name, ".md")).sort());
});
