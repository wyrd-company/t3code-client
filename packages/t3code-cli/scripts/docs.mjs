// ---
// relationships:
//   implements: documentation
//   references: library, library-reference
// ---
import * as NodeFSP from "node:fs/promises";
import * as NodePath from "node:path";
import { projectReference } from "./docsProjection.mjs";
import { syncReference } from "./docsOutputs.mjs";

const repository = NodePath.resolve(import.meta.dirname, "../../..");
const content = await NodeFSP.readFile(NodePath.join(repository, "docs/api.md"), "utf8");
await syncReference(
  NodePath.join(repository, "docs/user/t3c"),
  projectReference(content),
  process.argv.includes("--check"),
);
