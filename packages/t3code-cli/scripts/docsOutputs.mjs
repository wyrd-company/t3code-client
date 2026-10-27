// ---
// relationships:
//   implements: documentation
//   references: api, library-reference
// ---
import * as NodeFSP from "node:fs/promises";
import * as NodePath from "node:path";
import { generatedMarker } from "./docsProjection.mjs";

function isOwned(content) {
  return content.replace(/^---\n[\s\S]*?\n---\n\n/u, "").startsWith(`${generatedMarker}\n`);
}

export async function syncReference(directory, pages, check = false) {
  const files = await NodeFSP.readdir(directory);
  const existing = new Map();
  for (const filename of files.filter((name) => /^library-.*\.md$/u.test(name))) {
    const stat = await NodeFSP.lstat(NodePath.join(directory, filename));
    // Never follow a link to overwrite another file.
    existing.set(
      filename,
      stat.isFile()
        ? await NodeFSP.readFile(NodePath.join(directory, filename), "utf8")
        : undefined,
    );
  }
  const expected = new Set(pages.map(({ filename }) => filename));
  const stale = [...existing]
    .filter(([name, body]) => !expected.has(name) && body !== undefined && isOwned(body))
    .map(([name]) => name);
  const changed = pages.filter(({ filename, content }) => existing.get(filename) !== content);
  const collisions = pages.filter(
    ({ filename }) =>
      existing.has(filename) &&
      (existing.get(filename) === undefined || !isOwned(existing.get(filename))),
  );
  if (collisions.length)
    throw new Error(
      `Refusing to overwrite authored or non-regular pages: ${collisions.map((page) => page.filename).join(", ")}`,
    );
  if (check) {
    if (changed.length || stale.length)
      throw new Error(
        `Regenerate with task cli:docs. Missing/changed: ${changed.map((page) => page.filename).join(", ") || "none"}; stale owned pages: ${stale.join(", ") || "none"}.`,
      );
    return;
  }
  // Validate every collision before making any change. Only marked outputs are removed.
  for (const { filename, content } of changed)
    await NodeFSP.writeFile(NodePath.join(directory, filename), content);
  for (const filename of stale) await NodeFSP.unlink(NodePath.join(directory, filename));
}
