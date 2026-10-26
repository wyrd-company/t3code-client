// ---
// relationships:
//   verifies: releasing
// ---
import * as NodeChildProcess from "node:child_process";
import * as NodeFS from "node:fs";
import * as NodePath from "node:path";
import { afterEach, describe, expect, it } from "vite-plus/test";
import { fixture, run, write } from "./testSupport.ts";

const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0)) NodeFS.rmSync(root, { recursive: true, force: true });
});
function command(root: string, bin: string, args: string[]) {
  return NodeChildProcess.execFileSync(bin, args, {
    cwd: root,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
}
function setup() {
  const root = fixture();
  roots.push(root);
  write(
    root,
    ".intentional/config.yml",
    NodeFS.readFileSync(new URL("../../.intentional/config.yml", import.meta.url), "utf8"),
  );
  for (const unit of ["t3code-lib", "t3code-cli"])
    write(
      root,
      `packages/${unit}/package.json`,
      JSON.stringify({ name: `@wyrd-company/${unit}`, version: "0.0.0" }),
    );
  command(root, "git", ["init", "--quiet", "--initial-branch=main"]);
  command(root, "git", ["config", "user.name", "Agent"]);
  command(root, "git", ["config", "user.email", "agent@example.invalid"]);
  command(root, "git", ["add", "."]);
  command(root, "git", ["commit", "--quiet", "-m", "chore: initial projections"]);
  // The docs unit is tag-only: its baseline carries the docs-version it starts at.
  command(root, "intentional", ["tag", "--baseline", "--version", "t3c-docs=0.1.0"]);
  return root;
}
function release(root: string) {
  command(root, "intentional", [
    "add",
    "--release-unit",
    "t3code-lib:minor",
    "--message",
    "Provide library.",
  ]);
  command(root, "git", ["add", ".intentional/intents"]);
  command(root, "git", ["commit", "--quiet", "-m", "feat: record library intent"]);
  write(root, "release-plan.json", command(root, "intentional", ["plan"]));
  command(root, "intentional", ["apply"]);
  command(root, "git", ["add", "."]);
  command(root, "git", ["commit", "--quiet", "-m", "chore: apply release"]);
  command(root, "intentional", ["tag", "--plan", "release-plan.json"]);
  const origin = NodePath.join(root, "remote.git");
  command(root, "git", ["clone", "--quiet", "--bare", root, origin]);
  command(root, "git", ["remote", "add", "origin", origin]);
}

describe("Intentional record agreement", () => {
  it("releases one unit without bumping the other", () => {
    const root = setup();
    release(root);
    const result = run(root, "verify-plan.sh", ["t3code-lib@0.1.0", "release-plan.json"]);
    expect(result.status, result.stderr).toBe(0);
    expect(
      JSON.parse(NodeFS.readFileSync(`${root}/packages/t3code-cli/package.json`, "utf8")).version,
    ).toBe("0.0.0");
    const checked = run(root, "verify-release-tag.sh", ["t3code-lib@0.1.0"]);
    expect(checked.status, checked.stderr).toBe(0);
  });
  it("refuses apply after pending inputs drift from the saved plan", () => {
    const root = setup();
    command(root, "intentional", [
      "add",
      "--release-unit",
      "t3code-lib:minor",
      "--message",
      "Provide library.",
    ]);
    write(root, "saved-plan.json", command(root, "intentional", ["plan"]));
    command(root, "intentional", [
      "add",
      "--release-unit",
      "t3code-cli:minor",
      "--message",
      "Provide command.",
    ]);
    expect(run(root, "apply-plan.sh", ["saved-plan.json"]).status).not.toBe(0);
    expect(
      JSON.parse(NodeFS.readFileSync(`${root}/packages/t3code-lib/package.json`, "utf8")).version,
    ).toBe("0.0.0");
  });
  it("checks released history without replacing release records with baselines", () => {
    const root = setup();
    release(root);
    const result = run(root, "check-intents.sh");
    expect(result.status, result.stderr).toBe(0);
    expect(command(root, "git", ["tag", "--list", "t3code-lib@*"]).trim().split("\n")).toHaveLength(
      2,
    );
  });
  it("creates ephemeral zero baselines without tagging the source repository", () => {
    const root = setup();
    command(root, "git", ["tag", "-d", "t3code-lib@0.0.0", "t3code-cli@0.0.0"]);
    const result = run(root, "check-intents.sh");
    expect(result.status, result.stderr).toBe(0);
    expect(command(root, "git", ["tag", "--list"]).trim()).toBe("t3c-docs@0.1.0");
  });
  it("baselines a missing docs unit at its docs-version without tagging the source repository", () => {
    const root = setup();
    command(root, "git", ["tag", "-d", "t3c-docs@0.1.0"]);
    write(
      root,
      "docs/user/docs.yml",
      "schemaVersion: 1\nproducts:\n  t3c:\n    version: 0.0.0\n    docs-version: 0.1.0\n",
    );
    const result = run(root, "check-intents.sh");
    expect(result.status, result.stderr).toBe(0);
    expect(command(root, "git", ["tag", "--list", "t3c-docs@*"]).trim()).toBe("");
  });
  it("refuses a missing docs unit baseline when docs.yml holds no docs-version", () => {
    const root = setup();
    command(root, "git", ["tag", "-d", "t3c-docs@0.1.0"]);
    const result = run(root, "check-intents.sh");
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("Missing authoritative baseline for t3c-docs");
  });
  it("refuses missing authoritative history at a nonzero version", () => {
    const root = setup();
    command(root, "git", ["tag", "-d", "t3code-lib@0.0.0", "t3code-cli@0.0.0"]);
    write(
      root,
      "packages/t3code-lib/package.json",
      '{"name":"@wyrd-company/t3code-lib","version":"0.1.0"}',
    );
    expect(run(root, "check-intents.sh").status).not.toBe(0);
  });
  it("rejects baselines and a mismatched manifest version", () => {
    const root = setup();
    release(root);
    expect(run(root, "verify-release-tag.sh", ["t3code-lib@0.0.0"]).status).not.toBe(0);
    write(
      root,
      "packages/t3code-lib/package.json",
      '{"name":"@wyrd-company/t3code-lib","version":"0.2.0"}',
    );
    expect(run(root, "verify-release-tag.sh", ["t3code-lib@0.1.0"]).status).not.toBe(0);
  });
  it("rejects lightweight records and records off main", () => {
    const root = setup();
    release(root);
    command(root, "git", ["tag", "t3code-cli@0.1.0"]);
    command(root, "git", ["push", "--quiet", "origin", "refs/tags/t3code-cli@0.1.0"]);
    expect(run(root, "verify-release-tag.sh", ["t3code-cli@0.1.0"]).status).not.toBe(0);
    command(root, "git", ["checkout", "--quiet", "-b", "feature"]);
    command(root, "git", ["commit", "--quiet", "--allow-empty", "-m", "chore: off main"]);
    command(root, "git", [
      "tag",
      "-a",
      "t3code-lib@0.2.0",
      "-m",
      "tag-id: release-unit/t3code-lib/primary\nversion: 0.2.0",
    ]);
    command(root, "git", ["push", "--quiet", "origin", "refs/tags/t3code-lib@0.2.0"]);
    expect(run(root, "verify-release-tag.sh", ["t3code-lib@0.2.0"]).status).not.toBe(0);
  });
});
