// ---
// relationships:
//   verifies: releasing
// ---
import * as NodeChildProcess from "node:child_process";
import * as NodeFS from "node:fs";
import * as NodePath from "node:path";
import { afterEach, expect, it } from "vite-plus/test";
import { fake, fixture, tarball, write } from "./testSupport.ts";
const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0)) NodeFS.rmSync(root, { recursive: true, force: true });
});
function prepare(mismatch: boolean) {
  const root = fixture();
  roots.push(root);
  NodeFS.copyFileSync(
    new URL("../publish-homebrew-tap.sh", import.meta.url),
    NodePath.join(root, "scripts/publish-homebrew-tap.sh"),
  );
  const archive = tarball(root, "t3code-cli");
  const source = NodePath.join(root, "download.tgz");
  if (mismatch) write(root, "download.tgz", "different published bytes");
  else NodeFS.copyFileSync(archive, source);
  const tap = NodePath.join(root, "tap");
  NodeFS.mkdirSync(tap);
  const git = (args: string[]) =>
    NodeChildProcess.execFileSync("git", args, {
      cwd: tap,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
  git(["init"]);
  git(["config", "user.name", "Example"]);
  git(["config", "user.email", "example@example.invalid"]);
  write(tap, "Formula/t3c.rb", "original committed formula\n");
  git(["add", "Formula/t3c.rb"]);
  git(["commit", "-m", "chore: initialize test"]);
  if (mismatch) {
    write(tap, "Formula/t3c.rb", "original staged formula\n");
    git(["add", "Formula/t3c.rb"]);
    write(tap, "Formula/t3c.rb", "original working formula\n");
  }
  const snapshot = () => ({
    head: git(["rev-parse", "HEAD"]).trim(),
    index: NodeFS.readFileSync(NodePath.join(tap, ".git/index")).toString("hex"),
    formula: NodeFS.readFileSync(NodePath.join(tap, "Formula/t3c.rb"), "utf8"),
  });
  const before = snapshot();
  const env = fake(root, "curl", 'for last; do :; done\ncp "$SOURCE" "$last"');
  const result = NodeChildProcess.spawnSync(
    "bash",
    [
      NodePath.join(root, "scripts/publish-homebrew-tap.sh"),
      archive,
      "https://registry.npmjs.org/@wyrd-company/t3code-cli/-/t3code-cli-0.1.0.tgz",
      tap,
    ],
    { env: { ...process.env, ...env, SOURCE: source, PUSH_TAP: "0" }, encoding: "utf8" },
  );
  return { result, before, after: snapshot(), tap, git };
}
it("commits formula only when the published download matches the supplied archive", () => {
  const { result, before, after, tap, git } = prepare(false);
  expect(result.status, result.stderr).toBe(0);
  expect(after.head).not.toBe(before.head);
  expect(git(["show", "HEAD:Formula/t3c.rb"])).toBe(after.formula);
  expect(git(["status", "--porcelain"])).toBe("");
  expect(NodeFS.readFileSync(NodePath.join(tap, "Formula/t3c.rb"), "utf8")).toContain(
    "t3code-cli-0.1.0.tgz",
  );
});
it("preserves formula bytes HEAD and index when published URL bytes differ", () => {
  const { result, before, after } = prepare(true);
  expect(result.status, result.stderr).toBe(1);
  expect(after.head, "HEAD must be unchanged").toBe(before.head);
  expect(after.index, "index bytes must be unchanged").toBe(before.index);
  expect(after.formula, "formula bytes must be unchanged").toBe(before.formula);
});
