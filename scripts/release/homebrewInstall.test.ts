// ---
// relationships:
//   verifies: releasing
// ---
import * as NodeFS from "node:fs";
import * as NodePath from "node:path";
import { afterEach, expect, it } from "vite-plus/test";
import { fake, fixture, manifest, run, write } from "./testSupport.ts";

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

it("trusts only the temporary formula and removes its grant after an audit failure", () => {
  const root = fixture();
  roots.push(root);
  const log = NodePath.join(root, "calls");
  write(
    root,
    "scripts/release/verify-package.sh",
    "#!/usr/bin/env bash\nprintf '/example.tgz\\n'\n",
  );
  NodeFS.chmodSync(NodePath.join(root, "scripts/release/verify-package.sh"), 0o755);
  fake(root, "node", "printf 'file:///example.tgz\\n'");
  fake(root, "python3", "exit 0");
  const env = fake(
    root,
    "brew",
    `printf 'brew %s\\n' "$*" >> "$CALLS"
case "$1" in
  list) [[ "$*" == "list --versions node" ]] ;;
  --repository) printf '%s\\n' "$PWD/tap" ;;
  audit) exit 12 ;;
esac`,
  );
  const result = run(root, "test-homebrew.sh", [], { ...env, CALLS: log });
  expect(result.status, result.stderr).toBe(12);

  const calls = NodeFS.readFileSync(log, "utf8").trim().split("\n");
  const tap = calls[2]?.match(/^brew tap-new --no-git (local\/t3c-validation-\d+)$/)?.[1];
  expect(tap).toBeDefined();
  expect(calls).toEqual([
    "brew list --formula t3c",
    "brew list --versions node",
    `brew tap-new --no-git ${tap}`,
    `brew --repository ${tap}`,
    "brew command trust",
    `brew trust --formula ${tap}/t3c`,
    `brew style ${tap}/t3c`,
    `brew audit --strict ${tap}/t3c`,
    `brew list --formula ${tap}/t3c`,
    `brew untrust --formula ${tap}/t3c`,
    `brew untap ${tap}`,
  ]);
});
