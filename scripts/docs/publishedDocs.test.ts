// ---
// relationships:
//   verifies: documentation, releasing, tool-branding
// ---
import * as NodeFS from "node:fs";
import * as NodePath from "node:path";
import { parse } from "yaml";
import { expect, it } from "vite-plus/test";

const repository = NodePath.resolve(import.meta.dirname, "../..");
const user = NodePath.join(repository, "docs/user");
// The foundation job runs before package builds. Read literal tool declarations
// without loading handlers or workspace package exports.
const toolDirectory = NodePath.join(repository, "packages/t3code-mcp/src/tools");
const toolNames = NodeFS.readdirSync(toolDirectory)
  .filter((name) => name.endsWith(".ts"))
  .flatMap((name) =>
    [
      ...NodeFS.readFileSync(NodePath.join(toolDirectory, name), "utf8").matchAll(
        /\bdefineTool\(\s*["']([^"']+)["']/gu,
      ),
    ].map(([, name]) => name!),
  );

const read = (path: string) => NodeFS.readFileSync(NodePath.join(user, path), "utf8");
const config = parse(
  NodeFS.readFileSync(NodePath.join(repository, ".intentional/config.yml"), "utf8"),
) as {
  "release-units": Record<
    string,
    { path: string; projections: { adapter: string; file: string; pointer?: string }[] }
  >;
};
const changelogs = Object.entries(config["release-units"])
  .filter(([unit]) => unit.endsWith("-docs"))
  .map(([, unit]) =>
    NodePath.relative(user, NodePath.resolve(repository, unit.path, "CHANGELOG.md")),
  );
const markdownPages = (files: string[]) =>
  files.filter((name) => name.endsWith(".md") && !changelogs.includes(name));
const published = markdownPages(NodeFS.readdirSync(user, { recursive: true }).map(String));
type Product = {
  version: string;
  "docs-version": string;
  "release-unit": string;
  logo: string;
  favicon: string;
  media: { src: string }[];
  nav: { section: string; groups: { group: string; pages: string[] }[] }[];
  kinds: {
    kind: string;
    ref?: string;
    tools?: { name: string; description: string; effect: string }[];
  }[];
};
const manifest = parse(read("docs.yml")) as { assets: string[]; products: Record<string, Product> };
const front = (name: string) =>
  parse(read(name).match(/^---\n([\s\S]*?)\n---/u)![1]!) as {
    title: string;
    product: string;
    order: number;
  };

it("treats each configured docs changelog as release data, not a page", () => {
  expect(
    markdownPages([...changelogs, "t3c/getting-started.md", "t3mcp/getting-started.md"]),
  ).toEqual(["t3c/getting-started.md", "t3mcp/getting-started.md"]);
});
it("publishes each product as distinct, with matching code/docs projections", () => {
  expect(Object.keys(manifest.products).sort()).toEqual(["t3c", "t3c-proxy", "t3mcp"]);
  for (const [key, product] of Object.entries(manifest.products)) {
    const unit = config["release-units"][product["release-unit"]]!;
    const pkg = JSON.parse(
      NodeFS.readFileSync(NodePath.join(repository, unit.path, "package.json"), "utf8"),
    );
    expect(product.version).toBe(pkg.version);
    expect(unit.projections).toContainEqual({
      adapter: "yaml",
      file: "/docs/user/docs.yml",
      pointer: `/products/${key}/version`,
      mode: "committed",
    });
    expect(config["release-units"][`${key}-docs`]!.projections).toContainEqual({
      adapter: "yaml",
      file: "/docs/user/docs.yml",
      pointer: `/products/${key}/docs-version`,
      mode: "committed",
    });
  }
  expect(manifest.products["t3mcp"]!.kinds.map((kind) => kind.kind)).toEqual(["mcp-server"]);
});
it("lists every published page exactly once within its product navigation", () => {
  for (const [key, product] of Object.entries(manifest.products)) {
    const pages = published.filter((name) => front(name).product === key);
    for (const name of pages) {
      expect(front(name).title, name).toBeTruthy();
      expect(Number.isInteger(front(name).order), name).toBe(true);
      expect(name.startsWith(`${key}/`), name).toBe(true);
    }
    const slugs = product.nav.flatMap((section) => section.groups.flatMap((group) => group.pages));
    expect(slugs.sort()).toEqual(pages.map((name) => NodePath.basename(name, ".md")).sort());
    expect(new Set(slugs).size).toBe(slugs.length);
  }
  for (const name of published) expect(manifest.products).toHaveProperty(front(name).product);
});
it("places the generated library reference in its own Developers section", () => {
  const nav = manifest.products["t3c"]!.nav;
  const developers = nav.find((section) => section.section === "Developers")!;
  const pages = developers.groups.flatMap((group) => group.pages);
  expect(pages).toContain("library-reference");
  expect(pages.length).toBeGreaterThan(1);
  expect(pages.every((slug) => slug.startsWith("library-"))).toBe(true);
  expect(
    nav
      .filter((section) => section.section !== "Developers")
      .flatMap((section) => section.groups.flatMap((group) => group.pages))
      .some((slug) => slug.startsWith("library-")),
  ).toBe(false);
  for (const slug of pages) expect(read(`t3c/${slug}.md`)).toContain("Generated by task cli:docs");
});
it("resolves local page links without leaving each product's published folder", () => {
  for (const name of published) {
    const base = NodePath.join(user, front(name).product);
    for (const [, href] of read(name).matchAll(/\]\(([^)]+)\)/gu)) {
      if (!href || /^(?:[a-z]+:|#)/u.test(href)) continue;
      const target = NodePath.resolve(
        NodePath.dirname(NodePath.join(user, name)),
        href.split("#")[0]!,
      );
      expect(NodePath.relative(base, target).startsWith(".."), `${name}: ${href}`).toBe(false);
      expect(NodeFS.existsSync(target), `${name}: ${href}`).toBe(true);
    }
  }
});
it("registers real SVG marks and media for each product", () => {
  expect(new Set(manifest.assets).size).toBe(manifest.assets.length);
  for (const path of manifest.assets)
    expect(NodeFS.existsSync(NodePath.join(user, path)), path).toBe(true);
  for (const [key, product] of Object.entries(manifest.products)) {
    for (const asset of [product.logo, product.favicon, ...product.media.map((item) => item.src)])
      expect(manifest.assets).toContain(`${key}/${asset}`);
    const icon = read(`${key}/${product.logo}`);
    expect(icon).toContain('viewBox="0 0 512 512"');
    expect(icon).toContain(`<title id="title">${key}</title>`);
    expect(icon).not.toMatch(/<(?:script|image|foreignObject|text)\b/iu);
    expect(icon).not.toMatch(/(?:href|src)=/iu);
  }
  expect(read("t3mcp/assets/logo.svg")).toContain("MIT License");
  expect(
    NodeFS.readFileSync(NodePath.join(user, "t3c/assets/demo.gif")).subarray(0, 3).toString(),
  ).toBe("GIF");
});
it("documents every declared MCP tool without loading built packages", () => {
  const tools = manifest.products["t3mcp"]!.kinds[0]!.tools!;
  expect(tools.map((tool) => tool.name).sort()).toEqual([...toolNames].sort());
  for (const tool of tools) {
    expect(tool.description).toBeTruthy();
    expect(read("t3mcp/tools.md")).toContain(`\`${tool.name}\``);
  }
  expect(
    tools
      .filter((tool) => tool.effect === "Writes")
      .map((tool) => tool.name)
      .sort(),
  ).toEqual([
    "configure_scheduled_task",
    "rotate_scheduled_task_webhook",
    "thread_queue_resume",
    "thread_queue_start",
    "thread_stop",
  ]);
});
it.each(["t3mcp", "t3c-proxy"])("retains one initial major intent for each new %s unit", (key) => {
  const product = manifest.products[key]!;
  const initialUnits = [product["release-unit"], `${key}-docs`].filter(
    (unit) =>
      (unit === product["release-unit"] ? product.version : product["docs-version"]) === "0.0.0",
  );
  // A clean checkout has no intents directory once all pending intents are consumed.
  if (initialUnits.length === 0) return;
  const intents = NodeFS.readdirSync(NodePath.join(repository, ".intentional/intents")).map(
    (name) => NodeFS.readFileSync(NodePath.join(repository, ".intentional/intents", name), "utf8"),
  );
  for (const unit of initialUnits) {
    const matches = intents.filter((intent) => new RegExp(`^${unit}: major$`, "mu").test(intent));
    expect(matches, unit).toHaveLength(1);
  }
});
it("states the direct route in the t3c and t3mcp guides", () => {
  for (const guide of ["t3c/getting-started.md", "t3mcp/getting-started.md"]) {
    const text = read(guide).replace(/\s+/gu, " ");
    expect(text, guide).toContain("uses the direct route: pair its profile with the server's own");
    expect(text, guide).toContain("(https://wyrd.foo/tools/t3c-proxy)");
  }
});
it("documents the proxy's real options", () => {
  // The foundation job runs before package builds, so read the literal option declarations.
  const source = NodeFS.readFileSync(
    NodePath.join(repository, "packages/t3code-proxy/src/cliMain.ts"),
    "utf8",
  );
  const declared = [
    ...source.slice(source.indexOf("parseArgs(")).matchAll(/^\s+"?([a-z-]+)"?: \{ type:/gmu),
  ].map(([, name]) => `--${name}`);
  const documented = [...read("t3c-proxy/getting-started.md").matchAll(/^\| `(--[a-z-]+)/gmu)].map(
    ([, name]) => name!,
  );
  expect(declared.length).toBeGreaterThan(0);
  expect(documented.sort()).toEqual(declared.sort());
});
it("documents the Feature's real reference and options", () => {
  const feature = JSON.parse(
    NodeFS.readFileSync(
      NodePath.join(repository, "features/src/t3code-proxy/devcontainer-feature.json"),
      "utf8",
    ),
  ) as { id: string; version: string; options: Record<string, { default: string }> };
  const reference = `ghcr.io/wyrd-company/t3code-client/${feature.id}:${feature.version.split(".")[0]}`;
  expect(manifest.products["t3c-proxy"]!.kinds.map((kind) => kind.ref ?? kind.kind)).toEqual([
    "cli",
    reference,
  ]);
  const page = read("t3c-proxy/devcontainer-feature.md");
  expect(page).toContain(reference);
  expect(page).toContain(`\`${reference.split(":")[0]}\` runs`);
  const rows = [...page.matchAll(/^\| `([A-Za-z]+)`\s+\| `([^`]+)`/gmu)].map(([, name, value]) => [
    name!,
    value!,
  ]);
  expect(Object.fromEntries(rows)).toEqual(
    Object.fromEntries(
      Object.entries(feature.options).map(([name, option]) => [name, option.default]),
    ),
  );
});
it("lists each accepted limit of the proxy design", () => {
  const design = parse(
    NodeFS.readFileSync(NodePath.join(repository, "docs/technical-designs/proxy.yml"), "utf8"),
  ) as { "proposed-design": { "accepted-limits": string } };
  const bullets = (text: string) => text.match(/^- /gmu)?.length ?? 0;
  expect(bullets(design["proposed-design"]["accepted-limits"])).toBeGreaterThan(0);
  expect(bullets(read("t3c-proxy/limits.md"))).toBe(
    bullets(design["proposed-design"]["accepted-limits"]),
  );
});
it("uses only example hostnames in the proxy pages", () => {
  for (const name of published.filter((page) => page.startsWith("t3c-proxy/"))) {
    for (const [host] of read(name).matchAll(/\bt3[a-z-]*(?:\.[a-z0-9-]+)+\.[a-z]+\b/gu)) {
      expect(host, name).toMatch(/\.example\.test$/u);
    }
  }
});
