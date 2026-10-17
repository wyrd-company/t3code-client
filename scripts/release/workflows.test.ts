// ---
// relationships:
//   verifies: releasing
// ---
import * as NodeFS from "node:fs";
import { describe, expect, it } from "vite-plus/test";

const publish = () =>
  NodeFS.readFileSync(new URL("../../.github/workflows/publish.yml", import.meta.url), "utf8");
const release = () =>
  NodeFS.readFileSync(new URL("../../.github/workflows/release.yml", import.meta.url), "utf8");

describe("workflow agreements", () => {
  it("uses the same artifact identity and path across the upload and both downloads", () => {
    const names = [
      ...publish().matchAll(
        /uses: actions\/(?:upload|download)-artifact@[^\n]*\n\s+with:\n\s+name: ([^\n]+)/g,
      ),
    ].map((match) => match[1]);
    expect(names).toHaveLength(3);
    expect(new Set(names).size).toBe(1);
    expect(names[0]).toContain("github.ref_name");
    const paths = [...publish().matchAll(/path: (\$\{\{ runner.temp \}\}\/package)/g)];
    expect(paths).toHaveLength(3);
  });
  it("publishes only the two new unit tag families", () => {
    const patterns = [...publish().matchAll(/^      - "([^"]+@\*)"$/gm)]
      .map((match) => match[1])
      .sort();
    expect(patterns).toEqual(["t3code-cli@*", "t3code-lib@*"]);
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
    const ci = NodeFS.readFileSync(
      new URL("../../.github/workflows/ci.yml", import.meta.url),
      "utf8",
    );
    const [foundation, matrix] = ci.split("  check:");
    expect(foundation).toContain("  release-foundation:");
    expect(foundation).not.toContain("matrix:");
    for (const command of [
      "scripts/release/check-intents.sh",
      "pnpm run check",
      "pnpm exec tsc --noEmit",
      "pnpm exec vp test run",
    ]) {
      expect(ci.split(command)).toHaveLength(2);
      expect(foundation).toContain(command);
    }
    expect(foundation).toContain("name: Show Intentional status");
    expect(matrix).toContain("needs: release-foundation");
    expect(matrix).toContain("unit: [t3code-lib, t3code-cli]");
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

describe("distribution workflow agreements", () => {
  it("publishes the CLI docs only after its package succeeds", () => {
    const job = publish().split("  docs:")[1];
    expect(job).toContain("needs: [build, npm]");
    expect(job).toContain("if: startsWith(github.ref_name, 't3code-cli@')");
    expect(job).toContain("wyrd-company/wyrd.foo/.github/actions/publish-docs@v1");
    expect(job).toContain("docs-dir: docs");
    expect(job).toContain("secrets.WYRD_TOOLS_DOCS_PUBLISHER_APP_ID");
    expect(job).toContain("secrets.WYRD_TOOLS_DOCS_PUBLISHER_PRIVATE_KEY");
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
    const ci = NodeFS.readFileSync(
      new URL("../../.github/workflows/ci.yml", import.meta.url),
      "utf8",
    );
    const matrix = ci.split("  check:")[1]!;
    const build = matrix.indexOf('pnpm --filter "@wyrd-company/$UNIT..." run build');
    expect(build).toBeGreaterThan(0);
    for (const verb of ["typecheck", "test", "test:live", "package"])
      expect(build).toBeLessThan(matrix.indexOf(`pnpm --filter "@wyrd-company/$UNIT" run ${verb}`));
  });
  it("builds dependencies before selected Publish package checks", () => {
    const workflow = publish();
    const build = workflow.indexOf(
      'pnpm --filter "@wyrd-company/${GITHUB_REF_NAME%@*}..." run build',
    );
    expect(build).toBeGreaterThan(0);
    expect(build).toBeLessThan(
      workflow.indexOf('pnpm --filter "@wyrd-company/${GITHUB_REF_NAME%@*}" run typecheck'),
    );
  });
  it("builds the workspace before Release package checks", () => {
    const workflow = release();
    expect(workflow.indexOf("pnpm run build")).toBeLessThan(workflow.indexOf("pnpm run typecheck"));
  });
});
