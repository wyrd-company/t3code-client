// ---
// relationships:
//   verifies: releasing
// ---
import * as NodeFS from "node:fs";
import * as NodePath from "node:path";
import { afterEach, expect, it } from "vite-plus/test";
import { fake, fixture, manifest, run } from "./testSupport.ts";

const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0)) NodeFS.rmSync(root, { recursive: true, force: true });
});

it("rejects an existing installation with only the complete brew preflight trace", () => {
  const root = fixture();
  roots.push(root);
  manifest(root, "t3code-lib");
  const log = NodePath.join(root, "calls");
  NodeFS.writeFileSync(log, "");
  fake(root, "pnpm", 'printf "pnpm %s\\n" "$*" >> "$CALLS"; exit 1');
  const env = fake(
    root,
    "brew",
    'printf "brew %s\\n" "$*" >> "$CALLS"\n[[ "$*" == "list --formula t3c" || "$*" == "list --versions node" ]]',
  );
  const result = run(root, "test-homebrew.sh", [], { ...env, CALLS: log });
  expect(
    NodeFS.readFileSync(log, "utf8"),
    "preflight must precede every pack tap and install",
  ).toBe("brew list --formula t3c\n");
  expect(result.status).toBe(1);
  expect(result.stderr).toContain("An existing t3c installation must be preserved");
});
