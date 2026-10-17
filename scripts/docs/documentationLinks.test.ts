// ---
// relationships:
//   verifies: documentation
//   references: testing, library-testing, command-line
// ---
import * as NodeFS from "node:fs";
import * as NodePath from "node:path";
import { expect, it } from "vite-plus/test";

const root = NodePath.resolve(import.meta.dirname, "../..");
const repositoryPrefix = "https://github.com/wyrd-company/t3code-client/blob/main/";
const paths = [
  "README.md",
  "AGENTS.md",
  ...["t3code-lib", "t3code-cli"].flatMap((name) => [
    `packages/${name}/README.md`,
    `packages/${name}/AGENTS.md`,
  ]),
  ...NodeFS.readdirSync(NodePath.join(root, "docs"), { recursive: true })
    .filter((name) => /\.(?:md|yml|json)$/u.test(String(name)))
    .map((name) => `docs/${String(name)}`),
];

it("resolves guide, context and canonical structured documentation links and anchors", () => {
  for (const name of paths) {
    const path = NodePath.join(root, name);
    const content = NodeFS.readFileSync(path, "utf8");
    for (const [, href] of content.matchAll(/\]\(([^)]+)\)/gu)) {
      if (!href) continue;
      const local = href.startsWith(repositoryPrefix)
        ? NodePath.join(root, href.slice(repositoryPrefix.length))
        : /^[a-z]+:/u.test(href)
          ? undefined
          : href.startsWith("#")
            ? `${path}${href}`
            : NodePath.resolve(NodePath.dirname(path), href);
      if (local === undefined) continue;
      const [target, anchor] = local.split("#");
      expect(NodeFS.existsSync(target!), `${name}: ${href}`).toBe(true);
      if (anchor && target!.endsWith(".md")) {
        const body = NodeFS.readFileSync(target!, "utf8");
        const headings = [...body.matchAll(/^#+ (.+)$/gmu)].map(([, title]) =>
          title!
            .toLowerCase()
            .replace(/[^\w -]/gu, "")
            .replace(/ /gu, "-"),
        );
        const explicit = [...body.matchAll(/<a (?:name|id)="([^"]+)"/gu)].map(([, name]) => name);
        expect([...headings, ...explicit], `${name}: ${href}`).toContain(anchor);
      }
    }
  }
});
