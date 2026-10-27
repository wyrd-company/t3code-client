// ---
// relationships:
//   verifies: releasing
// ---
import * as NodeChildProcess from "node:child_process";
import * as NodeFS from "node:fs";
import { afterEach, expect, it } from "vite-plus/test";
import { fixture, run } from "./testSupport.ts";

const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0)) NodeFS.rmSync(root, { recursive: true, force: true });
});
function setup(tags: string[] = []) {
  const root = fixture();
  roots.push(root);
  const git = (...args: string[]) =>
    NodeChildProcess.execFileSync("git", args, {
      cwd: root,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
  git("init", "--quiet");
  git(
    "-c",
    "user.name=Agent",
    "-c",
    "user.email=agent@example.invalid",
    "commit",
    "--quiet",
    "--allow-empty",
    "-m",
    "chore: sample release",
  );
  for (const tag of tags) git("tag", tag);
  return { root, sha: git("rev-parse", "HEAD").trim() };
}
it.each([
  ["workflow_dispatch", "main", true],
  ["push", "t3code-cli@0.2.0", true],
  ["push", "t3code-mcp@0.1.0", true],
  ["push", "t3c-docs@0.3.0", true],
  ["push", "t3mcp-docs@0.1.0", true],
  ["push", "t3code-cli@0.0.0", false],
  ["push", "t3code-mcp@0.0.0", false],
  ["push", "t3mcp-docs@0.0.0", false],
  ["push", "t3code-lib@0.3.0", false],
  ["push", "main", false],
])("plans %s %s", (event, ref, publish) => {
  const { root, sha } = setup();
  const result = run(root, "plan-docs.sh", [String(event), String(ref), sha]);
  expect(result.status, result.stderr).toBe(0);
  expect(result.stdout).toBe(`publish=${publish}\n`);
});
it.each(["t3c-docs@0.3.0", "t3mcp-docs@0.1.0"])(
  "coalesces %s with either product package on the same commit",
  (ref) => {
    for (const tag of ["t3code-cli@0.2.0", "t3code-mcp@0.1.0"]) {
      const { root, sha } = setup([tag]);
      const result = run(root, "plan-docs.sh", ["push", ref, sha]);
      expect(result.status, result.stderr).toBe(0);
      expect(result.stdout).toBe("publish=false\n");
    }
  },
);
it("does not coalesce a docs release with a zero baseline", () => {
  const { root, sha } = setup(["t3code-mcp@0.0.0"]);
  expect(run(root, "plan-docs.sh", ["push", "t3c-docs@0.3.0", sha]).stdout).toBe("publish=true\n");
});
it("does not coalesce with a package release on an earlier commit", () => {
  const { root, sha } = setup(["t3code-mcp@0.1.0"]);
  NodeChildProcess.execFileSync(
    "git",
    [
      "-c",
      "user.name=Agent",
      "-c",
      "user.email=agent@example.invalid",
      "commit",
      "--quiet",
      "--allow-empty",
      "-m",
      "docs: sample update",
    ],
    { cwd: root },
  );
  const head = NodeChildProcess.execFileSync("git", ["rev-parse", "HEAD"], {
    cwd: root,
    encoding: "utf8",
  }).trim();
  expect(head).not.toBe(sha);
  expect(run(root, "plan-docs.sh", ["push", "t3mcp-docs@0.1.1", head]).stdout).toBe(
    "publish=true\n",
  );
});
it("fails instead of publishing when the tagged commit cannot be read", () => {
  const { root } = setup();
  const result = run(root, "plan-docs.sh", ["push", "t3mcp-docs@0.1.0", "sample-absent-ref"]);
  expect(result.status).not.toBe(0);
  expect(result.stdout).toBe("");
});
