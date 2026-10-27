// ---
// relationships:
//   implements: documentation
//   references: library, library-reference
// ---
import * as NodeFSP from "node:fs/promises";
import * as NodePath from "node:path";
import { projectReference } from "./docsProjection.mjs";
import { syncReference } from "./docsOutputs.mjs";
import { syncNavigation } from "./docsNavigation.mjs";

const repository = NodePath.resolve(import.meta.dirname, "../../..");
const content = await NodeFSP.readFile(NodePath.join(repository, "docs/api.md"), "utf8");
const pages = projectReference(content);
const check = process.argv.includes("--check");
await syncReference(NodePath.join(repository, "docs/user/t3c"), pages, check);
await syncNavigation(NodePath.join(repository, "docs/user/docs.yml"), pages, check);
