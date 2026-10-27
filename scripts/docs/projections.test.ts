// ---
// relationships:
//   verifies: documentation
//   references: command-line, library
// ---
import * as NodeFS from "node:fs";
import { expect, it } from "vite-plus/test";
import { projectReference } from "../../packages/t3code-cli/scripts/docsProjection.mjs";

const docs = new URL("../../docs/", import.meta.url);
const api = NodeFS.readFileSync(new URL("api.md", docs), "utf8");
const pages = projectReference(api);
const read = (filename: string): string =>
  NodeFS.readFileSync(new URL(`user/t3c/${filename}`, docs), "utf8");
const stripLinks = (text: string): string =>
  text
    .replace(/\]\([^)]+\)/gu, "]")
    .replace(/href=("|')[^"']+\1/gu, "href")
    .trim();

it("projects every API body, signature and summary exactly once without changing public content", () => {
  // Decompose the canonical source independently of the generator: every anchor
  // starts a body section, including methods and the final profile declarations.
  const bodies = api
    .slice(api.indexOf('<a name="T3Client">'))
    .split(/(?=^<a name="[^"]+"><\/a>|^## Profile and credential types$)/gmu)
    .filter(Boolean);
  const summaries = [
    ...api.slice(0, api.indexOf('<a name="T3Client">')).matchAll(/<dt>[\s\S]*?<\/dd>/gu),
  ].map(([entry]) => entry);
  const published = pages.map(({ filename }) => stripLinks(read(filename)));
  const preamble = api.replace(/^---\n[\s\S]*?\n---\n/u, "").split(/^## /mu)[0]!;
  expect(published[0]).toContain(stripLinks(preamble));
  for (const section of [...bodies, ...summaries]) {
    const expected = stripLinks(section);
    expect(
      published.reduce((count, page) => count + page.split(expected).length - 1, 0),
      section.slice(0, 100),
    ).toBe(1);
  }
  expect(bodies.length).toBeGreaterThan(70);
  expect(summaries.length).toBeGreaterThan(70);
  expect(published.join("\n")).toContain("## Profile and credential types");
  const sourceFences = [...api.matchAll(/^```ts\n[\s\S]*?^```/gmu)].map(([fence]) => fence);
  const outputFences = pages.flatMap(({ filename }) =>
    [...read(filename).matchAll(/^```ts\n[\s\S]*?^```/gmu)].map(([fence]) => fence),
  );
  expect(outputFences.sort()).toEqual(sourceFences.sort());
});

it("keeps every generated page fresh, bounded and in the t3c product", () => {
  expect(new Set(pages.map((page) => page.filename)).size).toBe(pages.length);
  expect(new Set(pages.map((page) => page.order)).size).toBe(pages.length);
  for (const page of pages) {
    expect(read(page.filename), page.filename).toBe(page.content);
    expect(page.content).toContain("from docs/api.md; edit the source.");
    expect(page.content).toContain("product: t3c\n");
    expect(page.order).toBeGreaterThanOrEqual(6);
    expect(page.content.split("\n").length, page.filename).toBeLessThanOrEqual(500);
  }
  expect(read("library-reference.md").split("\n").length).toBeLessThan(100);
  expect(read("library-reference.md")).not.toContain("<dd>");
});

it("resolves every markdown and HTML API link to its actual page and anchor", () => {
  const contents = new Map(pages.map(({ filename }) => [filename, read(filename)]));
  let crossPage = 0;
  let htmlLinks = 0;
  for (const [filename, body] of contents) {
    for (const [, markdown, html] of body.matchAll(/\]\(([^)]+)\)|href=["']([^"']+)["']/gu)) {
      const href = (markdown ?? html)!;
      if (html) htmlLinks++;
      const sitePrefix = "https://wyrd.foo/docs/t3c/";
      const isRendered = href.startsWith(sitePrefix);
      if (!isRendered && /^[a-z]+:/iu.test(href)) continue;
      const [route, fragment] = (isRendered ? href.slice(sitePrefix.length) : href).split("#");
      if (isRendered) expect(route).not.toMatch(/\.md$/u);
      const file = isRendered ? `${route}.md` : route;
      const target = contents.get(file || filename);
      expect(target, `${filename}: ${href}`).toBeDefined();
      if (fragment) {
        const explicit = [...target!.matchAll(/<a (?:name|id)="([^"]+)"/gu)].map(
          ([, anchor]) => anchor,
        );
        const headings = [...target!.matchAll(/^#+ (.+)$/gmu)].map(([, heading]) =>
          heading!
            .toLowerCase()
            .replace(/[^\w -]/gu, "")
            .replace(/ /gu, "-"),
        );
        expect([...explicit, ...headings], `${filename}: ${href}`).toContain(
          decodeURIComponent(fragment),
        );
        if (file && file !== filename) crossPage++;
      }
    }
  }
  expect(crossPage).toBeGreaterThan(20);
  expect(htmlLinks).toBeGreaterThan(70);
  const sourceAnchors = [...api.matchAll(/<a name="([^"]+)"><\/a>/gu)].map(([, anchor]) => anchor);
  const publishedAnchors = pages.flatMap(({ filename }) =>
    [...read(filename).matchAll(/<a name="([^"]+)"><\/a>/gu)].map(([, anchor]) => anchor),
  );
  expect(publishedAnchors.sort()).toEqual(sourceAnchors.sort());
});
