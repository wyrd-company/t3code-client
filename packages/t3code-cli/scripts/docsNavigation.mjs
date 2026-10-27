// ---
// relationships:
//   implements: documentation
//   references: library-reference
// ---
import * as NodeFSP from "node:fs/promises";
import { parseDocument } from "yaml";

/** Only the Developers section belongs to the generated reference. */
export async function syncNavigation(path, pages, check = false) {
  const document = parseDocument(await NodeFSP.readFile(path, "utf8"));
  if (document.errors.length) throw new Error("Invalid docs/user/docs.yml.");
  const nav = document.getIn(["products", "t3c", "nav"])?.toJSON();
  if (!Array.isArray(nav)) throw new Error("Expected t3c navigation in docs/user/docs.yml.");
  const groups = new Map();
  for (const page of pages) {
    if (!groups.has(page.group)) groups.set(page.group, []);
    groups.get(page.group).push(page.filename.replace(/\.md$/u, ""));
  }
  const section = {
    section: "Developers",
    groups: [...groups].map(([group, pages]) => ({ group, pages })),
  };
  const indexes = nav.flatMap((entry, index) => (entry.section === "Developers" ? [index] : []));
  if (indexes.length > 1) throw new Error("Duplicate Developers navigation sections.");
  const index = indexes[0];
  if (index !== undefined && JSON.stringify(nav[index]) === JSON.stringify(section)) return;
  if (check) throw new Error("Regenerate Developers navigation with task cli:docs.");
  if (index === undefined) document.addIn(["products", "t3c", "nav"], section);
  else document.setIn(["products", "t3c", "nav", index], section);
  await NodeFSP.writeFile(path, document.toString({ lineWidth: 100 }));
}
