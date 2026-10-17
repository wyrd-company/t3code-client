// ---
// relationships:
//   verifies: documentation
// ---
import * as NodePath from "node:path";
import { parse } from "yaml";

type RecordValue = Record<string, unknown>;
export type Artifact = { path: string; stem: string; kind: string; relationships: RecordValue };
function object(value: unknown): RecordValue {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as RecordValue)
    : {};
}

export function artifact(path: string, text: string): Artifact {
  const front = text.match(/^---\n([\s\S]*?)\n---(?:\n|$)/u)?.[1];
  const comments =
    text.match(/^(?:\/\/|#) ---\n([\s\S]*?)^(?:\/\/|#) ---/mu)?.[1] ??
    text.match(/^(?:(?:\/\/|#)[^\n]*\n)+/u)?.[0];
  let data: RecordValue = {};
  if (front !== undefined) data = object(parse(front));
  else if (comments?.includes("relationships:"))
    data = object(parse(comments.replace(/^(?:\/\/|#) ?/gmu, "")));
  else if (/\.(?:json|ya?ml)$/u.test(path)) data = object(parse(text));
  const schema = data["$schema"];
  return {
    path,
    stem: NodePath.basename(path, NodePath.extname(path)),
    kind: typeof schema === "string" ? schema : path.endsWith(".md") ? "guide" : "file",
    relationships: object(data["relationships"]),
  };
}

export function relationshipErrors(artifacts: Artifact[]): string[] {
  const errors: string[] = [];
  for (const source of artifacts) {
    for (const [relation, value] of Object.entries(source.relationships)) {
      const targets = Array.isArray(value)
        ? value
        : typeof value === "string"
          ? value.split(",")
          : [value];
      for (const raw of targets) {
        if (typeof raw !== "string") {
          errors.push(`${source.path}: ${relation} must name artifact targets`);
          continue;
        }
        const target = raw.trim();
        const found = artifacts.filter((candidate) =>
          target.includes("/") ? candidate.path === target : candidate.stem === target,
        );
        if (found.length !== 1) {
          errors.push(
            `${source.path}: ${relation} ${target} resolves to ${found.length} identities (${found.map((item) => item.path).join(", ")})`,
          );
        } else if (
          relation === "related-to" &&
          source.kind.endsWith("/technical-design") &&
          !found[0]!.kind.endsWith("/technical-design")
        ) {
          errors.push(`${source.path}: related-to ${target} must name a technical design`);
        }
      }
    }
  }
  return errors;
}
