// ---
// relationships:
//   verifies: releasing
// ---
import * as NodeChildProcess from "node:child_process";
import * as NodeFS from "node:fs";
import { describe, expect, it } from "vite-plus/test";
import { parse } from "yaml";
import { fake, fixture, run } from "./testSupport.ts";

const publish = () =>
  NodeFS.readFileSync(new URL("../../.github/workflows/publish.yml", import.meta.url), "utf8");
const release = () =>
  NodeFS.readFileSync(new URL("../../.github/workflows/release.yml", import.meta.url), "utf8");
const ci = () =>
  NodeFS.readFileSync(new URL("../../.github/workflows/ci.yml", import.meta.url), "utf8");
// Package units are the Intentional release units with an npm projection.
const config = parse(
  NodeFS.readFileSync(new URL("../../.intentional/config.yml", import.meta.url), "utf8"),
) as { "release-units": Record<string, { projections?: { adapter: string }[] }> };
const packageUnits = Object.entries(config["release-units"])
  .filter(([, unit]) => unit.projections?.some((projection) => projection.adapter === "npm"))
  .map(([name]) => name)
  .sort();

describe("workflow agreements", () => {
  it("uses the same artifact identity and path across the upload and both downloads", () => {
    const names = [
      ...publish().matchAll(
        /uses: actions\/(?:upload|download)-artifact@[^\n]*\n\s+with:\n\s+name: ([^\n]+)/g,
      ),
    ].map((match) => match[1]);
    expect(names).toHaveLength(3);
    expect(new Set(names).size).toBe(1);
    expect(names[0]).toBe("package-${{ needs.plan.outputs.record }}");
    const paths = [...publish().matchAll(/path: (\$\{\{ runner.temp \}\}\/package)/g)];
    expect(paths).toHaveLength(3);
  });
  it("publishes only the package and docs unit tag families", () => {
    const patterns = [...publish().matchAll(/^      - "([^"]+@\*)"$/gm)]
      .map((match) => match[1])
      .sort();
    expect(patterns).toEqual([
      "t3c-docs@*",
      "t3code-cli@*",
      "t3code-lib@*",
      "t3code-mcp@*",
      "t3mcp-docs@*",
    ]);
  });
  it("uses one saved plan for validation, apply and record creation", () => {
    const workflow = release();
    const paths = [
      ...workflow.matchAll(
        /(?:verify-plan\.sh "\$EXPECTED_RECORDS"|apply-plan\.sh|intentional tag --plan) "([^"]+)"/g,
      ),
    ].map((match) => match[1]);
    expect(paths).toHaveLength(3);
    expect(new Set(paths).size).toBe(1);
    expect(workflow).toContain(`intentional plan > "${paths[0]}"`);
  });
});

describe("release foundation wiring", () => {
  it("runs shared checks once before the package matrix", () => {
    const workflow = ci();
    const [foundation, matrix] = workflow.split("  check:");
    expect(foundation).toContain("  release-foundation:");
    expect(foundation).not.toContain("matrix:");
    for (const command of [
      "scripts/release/check-intents.sh",
      "pnpm run check",
      "pnpm exec tsc --noEmit",
      "pnpm exec vp test run",
    ]) {
      expect(workflow.split(command)).toHaveLength(2);
      expect(foundation).toContain(command);
    }
    expect(foundation).toContain("name: Show Intentional status");
    expect(matrix).toContain("needs: release-foundation");
    expect(matrix).toContain("unit: [t3code-lib, t3code-cli, t3code-mcp]");
  });
  it("checks package readiness before applying the saved release plan", () => {
    const workflow = release();
    const readiness = workflow.indexOf(
      'scripts/release/verify-readiness.sh "$RUNNER_TEMP/release-plan.json"',
    );
    expect(readiness).toBeGreaterThan(0);
    expect(readiness).toBeLessThan(workflow.indexOf("scripts/release/apply-plan.sh"));
  });
});

describe("package unit inventory", () => {
  it("names exactly the library, CLI and MCP package units", () => {
    expect(packageUnits).toEqual(["t3code-cli", "t3code-lib", "t3code-mcp"]);
  });
  it("checks every package unit in the CI matrix", () => {
    const matrix = /unit: \[([^\]]+)\]/.exec(ci())![1]!.split(/,\s*/).sort();
    expect(matrix).toEqual(packageUnits);
  });
  it("builds every package record except its zero baseline in Publish", () => {
    const condition = publish().split("\n  build:")[1]!.split("runs-on:")[0]!;
    expect(condition).toContain("needs: plan");
    expect(condition).toContain("if: needs.plan.outputs.build-package == 'true'");
    const root = fixture();
    try {
      const env = fake(
        root,
        "git",
        `
        if [[ "$2" == -t ]]; then echo tag; else
          record="\${3#refs/tags/}"
          printf 'tag-id: release-unit/%s/primary\\nversion: %s\\n' "\${record%@*}" "\${record#*@}"
        fi
      `,
      );
      for (const unit of packageUnits) {
        expect(run(root, "plan-package.sh", ["push", `${unit}@0.1.0`], env).stdout).toBe(
          `record=${unit}@0.1.0\nbuild-package=true\n`,
        );
        expect(run(root, "plan-package.sh", ["push", `${unit}@0.0.0`], env).stdout).toBe(
          "record=\nbuild-package=false\n",
        );
      }
    } finally {
      NodeFS.rmSync(root, { recursive: true, force: true });
    }
  });
  it("verifies executable package consumers with the packed library", () => {
    const pack = publish().split("- name: Pack")[1]!.split("- name:")[0]!;
    expect(pack).toContain('if [[ "$unit" != t3code-lib ]]; then');
    expect(pack).toContain('scripts/release/verify-consumer.sh "$tarball" "$unit" "$library"');
  });
  it("uses the tested documentation publish decision script", () => {
    const plan = publish().split("\n  plan:")[1]!.split("\n  build:")[0]!;
    expect(plan).toContain('scripts/release/plan-docs.sh "$EVENT_NAME" "$REF_NAME" "$GITHUB_SHA"');
  });
  it("accepts exactly the package units as release identities", () => {
    const script = new URL("./unit.sh", import.meta.url).pathname;
    const accepted = (unit: string) =>
      NodeChildProcess.spawnSync("bash", [
        "-c",
        'source "$1"; release_unit "$2"',
        "bash",
        script,
        unit,
      ]).status === 0;
    for (const unit of packageUnits) expect(accepted(unit)).toBe(true);
    for (const unit of ["t3c-docs", "t3mcp-docs", "t3code-client", "t3code"])
      expect(accepted(unit)).toBe(false);
  });
});

describe("distribution workflow agreements", () => {
  it("publishes the docs through the v2 reusable workflow after the GitHub Release", () => {
    const job = publish().split("\n  docs:")[1];
    expect(job).toContain("needs: [plan, build, npm, github-release]");
    expect(job).toContain("needs.plan.outputs.publish == 'true'");
    expect(job).toContain("uses: wyrd-company/wyrd.foo/.github/workflows/publish-docs.yml@v2");
    expect(job).not.toContain("docs-dir");
    expect(job).not.toContain("secrets: inherit");
    expect(job).toContain("secrets.WYRD_TOOLS_DOCS_PUBLISHER_APP_ID");
    expect(job).toContain("secrets.WYRD_TOOLS_DOCS_PUBLISHER_PRIVATE_KEY");
  });
  it("does not publish docs on a plain push to main and builds packages only for package records", () => {
    const workflow = publish();
    expect(workflow.split("\njobs:")[0]).not.toContain("branches:");
    expect(workflow).toContain("workflow_dispatch:");
    const build = workflow.split("\n  build:")[1]!.split("\n  npm:")[0]!;
    expect(build).toContain("needs: plan");
    expect(build).toContain("if: needs.plan.outputs.build-package == 'true'");
    expect(workflow).toContain(
      'scripts/release/plan-package.sh "$EVENT_NAME" "$REF_NAME" "$PUBLISH_PACKAGE"',
    );
  });
  it("regenerates shrinkwrap after applying release versions before the commit", () => {
    const workflow = release();
    const apply = workflow.indexOf("scripts/release/apply-plan.sh");
    const shrinkwrap = workflow.indexOf("exec node scripts/shrinkwrap.mjs");
    const commit = workflow.indexOf("git commit");
    expect(shrinkwrap).toBeGreaterThan(apply);
    expect(shrinkwrap).toBeLessThan(commit);
  });
});

describe("package dependency build ordering", () => {
  it("builds the selected package and library dependency before CI package typecheck or test", () => {
    const matrix = ci().split("  check:")[1]!;
    const build = matrix.indexOf('pnpm --filter "@wyrd-company/$UNIT..." run build');
    expect(build).toBeGreaterThan(0);
    for (const verb of ["typecheck", "test", "test:live", "package"])
      expect(build).toBeLessThan(matrix.indexOf(`pnpm --filter "@wyrd-company/$UNIT" run ${verb}`));
  });
  it("builds dependencies before selected Publish package checks", () => {
    const workflow = publish();
    const build = workflow.indexOf('pnpm --filter "@wyrd-company/${RECORD%@*}..." run build');
    expect(build).toBeGreaterThan(0);
    expect(build).toBeLessThan(
      workflow.indexOf('pnpm --filter "@wyrd-company/${RECORD%@*}" run typecheck'),
    );
  });
  it("builds the workspace before Release package checks", () => {
    const workflow = release();
    expect(workflow.indexOf("pnpm run build")).toBeLessThan(workflow.indexOf("pnpm run typecheck"));
  });
});
