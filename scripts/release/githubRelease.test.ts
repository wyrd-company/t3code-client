// ---
// relationships:
//   verifies: releasing
// ---
import * as NodeFS from "node:fs";
import * as NodePath from "node:path";
import { afterEach, expect, it } from "vite-plus/test";
import { fake, fixture, run, write } from "./testSupport.ts";

const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0)) NodeFS.rmSync(root, { recursive: true, force: true });
});

// A fake gh that records its calls, has no release until `create` and then
// serves the created asset back on download.
function setup(unit: string, existing = false) {
  const root = fixture();
  roots.push(root);
  const tarball = `wyrd-company-${unit}-0.1.0.tgz`;
  write(root, `package/${tarball}`, "bytes");
  write(root, "package/release-notes.md", "Notes");
  if (existing) write(root, "state/created", "");
  const env = fake(
    root,
    "gh",
    `root=${JSON.stringify(root)}
echo "$*" >> "$root/calls"
case "$1 $2" in
  "release view")
    [[ -f "$root/state/created" ]] || exit 1
    if [[ "$*" == *--json* ]]; then echo 1; fi ;;
  "release create") mkdir -p "$root/state"; touch "$root/state/created" ;;
  "release download")
    dir="\${@: -1}"
    cp "$root/package/${tarball}" "$dir/" ;;
esac`,
  );
  return { root, env };
}

function calls(root: string) {
  return NodeFS.readFileSync(NodePath.join(root, "calls"), "utf8").trim().split("\n");
}

it.each([
  ["t3code-cli", "--latest=true"],
  ["t3code-lib", "--latest=false"],
  ["t3code-mcp", "--latest=false"],
])("creates the %s release with %s", (unit, flag) => {
  const { root, env } = setup(unit);
  const result = run(
    root,
    "ensure-github-release.sh",
    [`${unit}@0.1.0`, NodePath.join(root, "package")],
    env,
  );
  expect(result.stderr).toBe("");
  expect(result.status).toBe(0);
  const create = calls(root).find((call) => call.startsWith("release create"));
  expect(create).toContain(flag);
  expect(create).toContain("--verify-tag");
});

it("leaves an existing release's latest state alone on a rerun", () => {
  const { root, env } = setup("t3code-cli", true);
  const result = run(
    root,
    "ensure-github-release.sh",
    ["t3code-cli@0.1.0", NodePath.join(root, "package")],
    env,
  );
  expect(result.status).toBe(0);
  expect(calls(root).some((call) => call.startsWith("release create"))).toBe(false);
  expect(calls(root).some((call) => call.includes("--latest"))).toBe(false);
});
