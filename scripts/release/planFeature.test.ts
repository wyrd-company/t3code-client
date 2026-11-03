// ---
// relationships:
//   verifies: releasing
// ---
import * as NodeChildProcess from "node:child_process";
import * as NodeFS from "node:fs";
import { afterEach, describe, expect, it } from "vite-plus/test";
import { fixture, run, write } from "./testSupport.ts";

const roots: string[] = [];
const MANIFEST = "features/src/t3code-proxy/devcontainer-feature.json";
afterEach(() => {
  for (const root of roots.splice(0)) NodeFS.rmSync(root, { recursive: true, force: true });
});

function setup(version = "0.1.0") {
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
  write(root, MANIFEST, JSON.stringify({ id: "t3code-proxy", version }));
  git("add", ".");
  git("commit", "--quiet", "-m", "chore: sample release");
  git("remote", "add", "origin", root);
  git("fetch", "--quiet", "origin");
  const tag = (record: string, annotation?: string) =>
    git(
      "tag",
      "-a",
      record,
      "-m",
      annotation ??
        `tag-id: release-unit/${record.split("@")[0]}/primary\nversion: ${record.split("@")[1]}`,
    );
  return { root, git, tag };
}

describe("plan-feature.sh", () => {
  it("selects a pushed annotated record", () => {
    const { root, tag } = setup();
    tag("t3code-proxy-feature@0.1.0");
    const result = run(root, "plan-feature.sh", ["push", "t3code-proxy-feature@0.1.0"]);
    expect(result.stderr).toBe("");
    expect(result.stdout).toBe("feature-record=t3code-proxy-feature@0.1.0\n");
  });
  it("selects nothing for a zero baseline or another unit", () => {
    const { root } = setup();
    for (const ref of ["t3code-proxy-feature@0.0.0", "t3code-proxy@0.1.0", "t3c-docs@0.1.0"]) {
      expect(run(root, "plan-feature.sh", ["push", ref]).stdout).toBe("feature-record=\n");
    }
  });
  it("selects nothing for a manual run that does not ask for the Feature", () => {
    const { root } = setup();
    const result = run(root, "plan-feature.sh", ["workflow_dispatch", "main", "false"]);
    expect(result.stdout).toBe("feature-record=\n");
  });
  it("selects the record of a manual run that asks for the Feature", () => {
    const { root, tag } = setup();
    tag("t3code-proxy-feature@0.1.0");
    const result = run(root, "plan-feature.sh", [
      "workflow_dispatch",
      "t3code-proxy-feature@0.1.0",
      "true",
    ]);
    expect(result.stdout).toBe("feature-record=t3code-proxy-feature@0.1.0\n");
  });
  it.each([["main"], ["t3code-proxy@0.1.0"], ["t3code-proxy-feature@0.0.0"]])(
    "refuses a manual Feature run for %s",
    (ref) => {
      const { root } = setup();
      const result = run(root, "plan-feature.sh", ["workflow_dispatch", ref, "true"]);
      expect(result.status).toBe(1);
      expect(result.stderr).toContain("requires a nonzero Feature release record");
    },
  );
  it("refuses a lightweight tag and an invalid flag", () => {
    const { root, git } = setup();
    git("tag", "t3code-proxy-feature@0.1.0");
    const light = run(root, "plan-feature.sh", ["push", "t3code-proxy-feature@0.1.0"]);
    expect(light.status).toBe(1);
    expect(light.stderr).toContain("annotated");
    expect(run(root, "plan-feature.sh", ["push", "main", "maybe"]).status).toBe(1);
  });
});

describe("verify-feature-record.sh", () => {
  const verify = (root: string, record: string) =>
    run(root, "verify-feature-record.sh", [record, MANIFEST]);

  it("accepts the annotated record of the checked-out version", () => {
    const { root, tag } = setup();
    tag("t3code-proxy-feature@0.1.0");
    const result = verify(root, "t3code-proxy-feature@0.1.0");
    expect(result.stderr).toBe("");
    expect(result.status).toBe(0);
  });
  it("refuses another unit's record", () => {
    const { root, tag } = setup();
    tag("t3code-proxy@0.1.0");
    expect(verify(root, "t3code-proxy@0.1.0").stderr).toContain("not a Feature record");
  });
  it("refuses a lightweight tag", () => {
    const { root, git } = setup();
    git("tag", "t3code-proxy-feature@0.1.0");
    expect(verify(root, "t3code-proxy-feature@0.1.0").stderr).toContain("not annotated");
  });
  it("refuses a record of another identity", () => {
    const { root, tag } = setup();
    tag("t3code-proxy-feature@0.1.0", "tag-id: release-unit/t3code-proxy/primary\nversion: 0.1.0");
    expect(verify(root, "t3code-proxy-feature@0.1.0").stderr).toContain("does not record");
  });
  it("refuses a baseline record", () => {
    const { root, tag } = setup();
    tag(
      "t3code-proxy-feature@0.1.0",
      "tag-id: release-unit/t3code-proxy-feature/primary\nversion: 0.1.0\nbaseline: true",
    );
    expect(verify(root, "t3code-proxy-feature@0.1.0").stderr).toContain("baseline");
  });
  it("refuses a record that is not at the checked-out commit", () => {
    const { root, git, tag } = setup();
    tag("t3code-proxy-feature@0.1.0");
    git("commit", "--quiet", "--allow-empty", "-m", "chore: later");
    expect(verify(root, "t3code-proxy-feature@0.1.0").stderr).toContain("checked-out commit");
  });
  it("refuses a record that is not on main", () => {
    const { root, git, tag } = setup();
    git("checkout", "--quiet", "-b", "other");
    git("commit", "--quiet", "--allow-empty", "-m", "chore: elsewhere");
    tag("t3code-proxy-feature@0.1.0");
    expect(verify(root, "t3code-proxy-feature@0.1.0").stderr).toContain("not on main");
  });
  it("refuses a version that the manifest does not declare", () => {
    const { root, tag } = setup("0.2.0");
    tag("t3code-proxy-feature@0.1.0");
    expect(verify(root, "t3code-proxy-feature@0.1.0").stderr).toContain("declares 0.2.0");
  });
});
