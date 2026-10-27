// ---
// relationships:
//   verifies: documentation
//   references: library, api, testing
// ---
import * as NodeCP from "node:child_process";
import * as NodeFS from "node:fs/promises";
import * as NodeOS from "node:os";
import * as NodePath from "node:path";
import { afterEach, expect, it } from "vite-plus/test";
import {
  generatedMarker,
  projectReference,
  rewriteLinks,
} from "../../packages/t3code-cli/scripts/docsProjection.mjs";
import { syncReference } from "../../packages/t3code-cli/scripts/docsOutputs.mjs";

const fixture = `# Library API reference

See [auth](api.md#AuthClient) and <a href="#T3Client+connect">connect</a>.

## Classes

<dl>
<dt><a href="#T3Client">T3Client</a></dt>
<dd><p>Composition root.</p>
</dd>
<dt><a href="#AuthClient">AuthClient</a></dt>
<dd><p>Credentials.</p>
</dd>
</dl>

<a name="T3Client"></a>

## T3Client

Client description.

<a name="T3Client+connect"></a>

### client.connect()

[auth](#AuthClient) <a href="./api.md#AuthClient">authenticate</a>

\`\`\`ts
connect(): Promise<void>;
## Example heading
<a name="example"></a>
const example = '[link](#not-an-api-anchor)';
\`\`\`

<a name="AuthClient"></a>

## AuthClient

Credentials body.
`;
const roots: string[] = [];
afterEach(async () => {
  await Promise.all(
    roots.splice(0).map((root) => NodeFS.rm(root, { recursive: true, force: true })),
  );
});
async function temporary(): Promise<string> {
  const root = await NodeFS.mkdtemp(NodePath.join(NodeOS.tmpdir(), "docs-generator-"));
  roots.push(root);
  return root;
}

it("splits only between intact sections at the line boundary, retaining examples and summaries", () => {
  const pages = projectReference(fixture, 15);
  expect(pages.map((page) => page.filename)).toEqual([
    "library-reference.md",
    "library-client.md",
    "library-client-2.md",
    "library-authentication.md",
  ]);
  const continuation = pages.find((page) => page.filename === "library-client-2.md")!.content;
  expect(continuation).toContain('<a name="T3Client+connect"></a>\n\n### client.connect()');
  expect(continuation).toContain("const example = '[link](#not-an-api-anchor)';");
  expect(continuation).toContain("[auth](library-authentication.md#AuthClient)");
  expect(continuation).toContain('href="library-authentication.md#AuthClient"');
  expect(pages[0]!.content).toContain('href="library-client-2.md#T3Client+connect"');
  expect(
    projectReference(fixture, 28).some((page) => page.filename === "library-client-2.md"),
  ).toBe(false);
  expect(() => projectReference(fixture, 12)).toThrow("API block exceeds");
  expect(
    projectReference(fixture, 14).filter((page) => page.filename.startsWith("library-client"))
      .length,
  ).toBe(3);
  expect(projectReference(fixture, 15)).toEqual(pages);
});

it("rewrites encoded API fragments and both HTML quote styles while preserving remote links", () => {
  const owners = new Map([["ThreadsApi+get", "library-threads.md"]]);
  const body = `[local](#ThreadsApi%2Bget) <a href='api.md#ThreadsApi+get'>get</a>
[external](https://example.test/path#part) <a href="//example.test/path">remote</a>
[design](technical-designs/library.yml#contract) [home](./api.md)
[page](library-threads.md#ThreadsApi+get)`;
  expect(rewriteLinks(body, "library-client.md", owners))
    .toBe(`[local](library-threads.md#ThreadsApi%2Bget) <a href='library-threads.md#ThreadsApi+get'>get</a>
[external](https://example.test/path#part) <a href="//example.test/path">remote</a>
[design](https://github.com/wyrd-company/t3code-client/blob/main/docs/technical-designs/library.yml#contract) [home](library-reference.md)
[page](library-threads.md#ThreadsApi+get)`);
  expect(rewriteLinks("[get](#ThreadsApi+get)", "library-threads.md", owners)).toBe(
    "[get](#ThreadsApi+get)",
  );
});

it("fails closed on unknown summary syntax, broken anchors, unclosed examples and oversized sections", () => {
  expect(() => projectReference(fixture.replace("<dd><p>Composition", "<p>Composition"))).toThrow(
    "summary entry",
  );
  expect(() =>
    projectReference(fixture.replace("## Classes", "## Classes\n\nUnrecognized prose")),
  ).toThrow("summary content");
  expect(() =>
    projectReference(fixture.replace("[auth](#AuthClient)", "[missing](#Missing)")),
  ).toThrow("Unresolved API anchor");
  expect(() => projectReference(`${fixture}\n\`\`\`ts\n`)).toThrow("Unclosed code fence");
  expect(() => projectReference(`${fixture}\n## Unexpected section\n\nProse\n`)).toThrow(
    "Unrecognized API section",
  );
  expect(() =>
    projectReference(
      fixture.replace(
        '<a name="AuthClient">',
        '## Unexpected section\n\nProse\n\n<a name="AuthClient">',
      ),
    ),
  ).toThrow("Unrecognized API section");
  expect(() =>
    projectReference(fixture.replace('<a name="T3Client">', '<a name="T3Client+orphan">')),
  ).toThrow("no enclosing public section");
});

it("detects missing, changed and extra owned outputs without writing in check mode, then converges", async () => {
  const directory = await temporary();
  const pages = projectReference(fixture);
  const stale = NodePath.join(directory, "library-obsolete.md");
  const authored = NodePath.join(directory, "library-notes.md");
  const unrelated = NodePath.join(directory, "guide.md");
  await NodeFS.writeFile(authored, "# Authored notes\n");
  await NodeFS.writeFile(unrelated, `${generatedMarker}\nUnrelated generator namespace\n`);
  await expect(syncReference(directory, pages, true)).rejects.toThrow("Missing/changed:");
  expect(await NodeFS.readdir(directory)).toEqual(["guide.md", "library-notes.md"]);
  await syncReference(directory, pages);
  await expect(syncReference(directory, pages, true)).resolves.toBeUndefined();
  await NodeFS.writeFile(stale, pages[0]!.content);
  await expect(syncReference(directory, pages, true)).rejects.toThrow(
    "stale owned pages: library-obsolete.md",
  );
  await NodeFS.writeFile(
    NodePath.join(directory, pages[1]!.filename),
    `${pages[1]!.content}\nChanged\n`,
  );
  await NodeFS.unlink(NodePath.join(directory, pages[2]!.filename));
  const before = await NodeFS.readFile(stale, "utf8");
  await expect(syncReference(directory, pages, true)).rejects.toThrow(
    "library-client.md, library-authentication.md",
  );
  expect(await NodeFS.readFile(stale, "utf8")).toBe(before);
  await syncReference(directory, pages);
  await expect(syncReference(directory, pages, true)).resolves.toBeUndefined();
  await expect(NodeFS.stat(stale)).rejects.toThrow();
  expect(await NodeFS.readFile(authored, "utf8")).toBe("# Authored notes\n");
  expect(await NodeFS.readFile(unrelated, "utf8")).toContain("Unrelated generator namespace");
});

it("refuses authored collisions and symlinks before changing or deleting any output", async () => {
  const directory = await temporary();
  const pages = projectReference(fixture);
  const collision = NodePath.join(directory, "library-client.md");
  const stale = NodePath.join(directory, "library-obsolete.md");
  await NodeFS.writeFile(collision, "# Authored client\n");
  await NodeFS.writeFile(stale, pages[0]!.content);
  for (const check of [true, false])
    await expect(syncReference(directory, pages, check)).rejects.toThrow(
      "Refusing to overwrite authored",
    );
  await expect(NodeFS.stat(NodePath.join(directory, "library-reference.md"))).rejects.toThrow();
  expect(await NodeFS.readFile(stale, "utf8")).toBe(pages[0]!.content);
  await NodeFS.unlink(collision);
  await NodeFS.symlink(stale, collision);
  await expect(syncReference(directory, pages)).rejects.toThrow("non-regular pages");
  expect(await NodeFS.readFile(stale, "utf8")).toBe(pages[0]!.content);
});

it("wires the command entry point to generate and check the complete output set", async () => {
  const root = await temporary();
  const scripts = NodePath.join(root, "packages/t3code-cli/scripts");
  const published = NodePath.join(root, "docs/user/t3c");
  await NodeFS.mkdir(scripts, { recursive: true });
  await NodeFS.mkdir(published, { recursive: true });
  for (const filename of [
    "docs.mjs",
    "docsProjection.mjs",
    "docsOutputs.mjs",
    "docsNavigation.mjs",
  ])
    await NodeFS.copyFile(
      new URL(`../../packages/t3code-cli/scripts/${filename}`, import.meta.url),
      NodePath.join(scripts, filename),
    );
  await NodeFS.symlink(
    NodePath.resolve(import.meta.dirname, "../../node_modules"),
    NodePath.join(root, "node_modules"),
    "dir",
  );
  await NodeFS.writeFile(
    NodePath.join(root, "docs/user/docs.yml"),
    "schemaVersion: 1\nproducts:\n  t3c:\n    nav: [{section: Reference, groups: [{group: Commands, pages: [commands]}]}]\n",
  );
  await NodeFS.writeFile(NodePath.join(root, "docs/api.md"), fixture);
  const run = (args: string[]) =>
    NodeCP.spawnSync(process.execPath, [NodePath.join(scripts, "docs.mjs"), ...args], {
      encoding: "utf8",
    });
  expect(run(["--check"]).status).toBe(1);
  expect(run([]).status).toBe(0);
  expect(run(["--check"]).status).toBe(0);
  await NodeFS.unlink(NodePath.join(published, "library-authentication.md"));
  const missing = run(["--check"]);
  expect(missing.status).toBe(1);
  expect(missing.stderr).toContain("library-authentication.md");
  expect(run([]).status).toBe(0);
  await NodeFS.writeFile(
    NodePath.join(published, "library-old.md"),
    projectReference(fixture)[0]!.content,
  );
  expect(run(["--check"]).status).toBe(1);
  expect(run([]).status).toBe(0);
  await expect(NodeFS.stat(NodePath.join(published, "library-old.md"))).rejects.toThrow();
});
