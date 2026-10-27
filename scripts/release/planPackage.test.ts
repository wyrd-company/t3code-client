// ---
// relationships:
//   verifies: releasing
// ---
import * as NodeChildProcess from "node:child_process";
import * as NodeFS from "node:fs";
import { afterEach, expect, it } from "vite-plus/test";
import { fixture, manifest, run } from "./testSupport.ts";

const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0)) NodeFS.rmSync(root, { recursive: true, force: true });
});
function setup() {
  const root = fixture();
  roots.push(root);
  const git = (...args: string[]) =>
    NodeChildProcess.execFileSync("git", args, {
      cwd: root,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    }).trim();
  git("init", "--quiet", "--initial-branch=main");
  git("config", "user.name", "Agent");
  git("config", "user.email", "agent@example.invalid");
  for (const unit of ["t3code-lib", "t3code-cli", "t3code-mcp"]) manifest(root, unit);
  git("add", ".");
  git("commit", "--quiet", "-m", "chore: sample release");
  const tag = (record: string, annotation?: string) => {
    git(
      "tag",
      "-a",
      record,
      "-m",
      annotation ??
        `tag-id: release-unit/${record.split("@")[0]}/primary\nversion: ${record.split("@")[1]}`,
    );
  };
  return { root, git, tag };
}

it.each(["t3code-lib", "t3code-cli", "t3code-mcp"])(
  "plans automatic and explicitly requested %s package publication",
  (unit) => {
    const { root, tag } = setup();
    const record = `${unit}@0.1.0`;
    tag(record);
    for (const args of [
      ["push", record],
      ["workflow_dispatch", record, "true"],
    ]) {
      const result = run(root, "plan-package.sh", args);
      expect(result.status, result.stderr).toBe(0);
      expect(result.stdout).toBe(`record=${record}\nbuild-package=true\n`);
    }
  },
);

it.each(["main", "t3c-docs@0.1.0", "t3code-lib@0.1.0", "abcdef"])(
  "keeps manual %s docs-only by default and with explicit false",
  (ref) => {
    const { root, tag } = setup();
    if (ref === "t3code-lib@0.1.0") tag(ref);
    for (const args of [
      ["workflow_dispatch", ref],
      ["workflow_dispatch", ref, "false"],
    ]) {
      const result = run(root, "plan-package.sh", args);
      expect(result.status, result.stderr).toBe(0);
      expect(result.stdout).toBe("record=\nbuild-package=false\n");
      expect(run(root, "plan-docs.sh", ["workflow_dispatch", ref, "HEAD"]).stdout).toBe(
        "publish=true\n",
      );
    }
  },
);

it.each([
  "t3code-lib@0.0.0",
  "t3code-cli@0.0.0",
  "t3code-mcp@0.0.0",
  "t3c-docs@0.1.0",
  "t3mcp-docs@0.1.0",
  "main",
])("does not build non-package push %s", (ref) => {
  const { root } = setup();
  const result = run(root, "plan-package.sh", ["push", ref]);
  expect(result.status, result.stderr).toBe(0);
  expect(result.stdout).toBe("record=\nbuild-package=false\n");
});

it.each([
  "main",
  "HEAD",
  "t3code-client@0.1.0",
  "t3c-docs@0.1.0",
  "t3mcp-docs@0.1.0",
  "t3code-lib@0.0.0",
  "t3code-cli@0.0.0",
  "t3code-mcp@0.0.0",
  "t3code-lib@next",
  "t3code-lib@0.1.0\nbuild-package=true",
])("rejects explicit package publication from %s before emitting outputs", (ref) => {
  const { root } = setup();
  const result = run(root, "plan-package.sh", ["workflow_dispatch", ref, "true"]);
  expect(result.status).not.toBe(0);
  expect(result.stdout).toBe("");
});

it("rejects missing, lightweight and non-Intentional annotated tags", () => {
  const { root, git, tag } = setup();
  git("tag", "t3code-lib@0.1.0");
  tag("t3code-cli@0.1.0", "sample annotation");
  for (const ref of ["t3code-lib@0.1.0", "t3code-cli@0.1.0", "t3code-mcp@0.1.0"]) {
    const result = run(root, "plan-package.sh", ["workflow_dispatch", ref, "true"]);
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain(
      ref === "t3code-cli@0.1.0" ? "does not record" : "existing annotated release tag",
    );
    expect(result.stdout).toBe("");
  }
});

it("rejects a lightweight tag even when the commit message has valid record metadata", () => {
  const { root, git } = setup();
  git(
    "commit",
    "--quiet",
    "--allow-empty",
    "-m",
    "chore: sample metadata\n\ntag-id: release-unit/t3code-lib/primary\nversion: 0.1.0",
  );
  git("tag", "t3code-lib@0.1.0");
  const result = run(root, "plan-package.sh", ["workflow_dispatch", "t3code-lib@0.1.0", "true"]);
  expect(result.status).not.toBe(0);
  expect(result.stderr).toContain("existing annotated release tag");
  expect(result.stdout).toBe("");
});

it.each([
  "tag-id: release-unit/t3code-cli/primary\nversion: 0.1.0",
  "tag-id: release-unit/t3code-lib/primary\nversion: 0.2.0",
  "tag-id: release-unit/t3code-lib/primary\nversion: 0.1.0\nbaseline: true",
])("rejects a mismatched or nonzero baseline annotation: %s", (annotation) => {
  const { root, tag } = setup();
  tag("t3code-lib@0.1.0", annotation);
  const result = run(root, "plan-package.sh", ["workflow_dispatch", "t3code-lib@0.1.0", "true"]);
  expect(result.status).not.toBe(0);
  expect(result.stdout).toBe("");
});

it("plans the selected existing record on a newer workflow checkout but verifies only its exact commit", () => {
  const { root, git, tag } = setup();
  const record = "t3code-lib@0.1.0";
  tag(record);
  const target = git("rev-parse", "HEAD");
  git("commit", "--quiet", "--allow-empty", "-m", "ci: newer workflow source");
  git("remote", "add", "origin", root);
  const result = run(root, "plan-package.sh", ["workflow_dispatch", record, "true"]);
  expect(result.status, result.stderr).toBe(0);
  expect(result.stdout).toBe(`record=${record}\nbuild-package=true\n`);
  expect(git("rev-parse", "HEAD")).not.toBe(target);
  const wrongHead = run(root, "verify-release-tag.sh", [record]);
  expect(wrongHead.status).not.toBe(0);
  expect(wrongHead.stderr).toContain("does not point at the checked-out commit");
  git("checkout", "--quiet", record);
  const verified = run(root, "verify-release-tag.sh", [record]);
  expect(verified.status, verified.stderr).toBe(0);
});

it("still rejects a matching annotated record off main before publication", () => {
  const { root, git, tag } = setup();
  git("checkout", "--quiet", "-b", "sample-feature");
  git("commit", "--quiet", "--allow-empty", "-m", "chore: sample branch release");
  tag("t3code-lib@0.1.0");
  git("remote", "add", "origin", root);
  const result = run(root, "verify-release-tag.sh", ["t3code-lib@0.1.0"]);
  expect(result.status).not.toBe(0);
  expect(result.stderr).toContain("not on main");
});
