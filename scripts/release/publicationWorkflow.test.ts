// ---
// relationships:
//   verifies: releasing
// ---
import * as NodeChildProcess from "node:child_process";
import * as NodeFS from "node:fs";
import { afterEach, expect, it } from "vite-plus/test";
import { parse } from "yaml";
import { fake, fixture } from "./testSupport.ts";

interface Step {
  name: string;
  id?: string;
  uses?: string;
  with?: Record<string, string | number | boolean>;
  env?: Record<string, string>;
  run?: string;
}
interface Job {
  steps: Step[];
  needs?: string | string[];
  if?: string;
  env?: Record<string, string>;
  permissions?: Record<string, string>;
  outputs?: Record<string, string>;
  with?: Record<string, string>;
}
interface Workflow {
  "run-name"?: string;
  on: { workflow_dispatch: { inputs: Record<string, { type?: string; default?: unknown }> } };
  jobs: Record<string, Job>;
}
function workflow(name: string) {
  return parse(
    NodeFS.readFileSync(new URL(`../../.github/workflows/${name}.yml`, import.meta.url), "utf8"),
  ) as Workflow;
}
const publish = workflow("publish");
const release = workflow("release");
const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0)) NodeFS.rmSync(root, { recursive: true, force: true });
});

function runPlan(event: string, record: string, optIn: boolean) {
  const root = fixture();
  roots.push(root);
  const [unit, version] = record.split("@");
  const env = fake(
    root,
    "git",
    `if [[ "$2" == -t ]]; then echo tag; else
      printf 'tag-id: release-unit/${unit}/primary\\nversion: ${version}\\n'
    fi`,
  );
  const step = publish.jobs["plan"]!.steps.find((step) => step.id === "plan")!;
  const result = NodeChildProcess.spawnSync("bash", ["-eo", "pipefail", "-c", step.run!], {
    cwd: root,
    encoding: "utf8",
    env: {
      ...process.env,
      ...env,
      GITHUB_OUTPUT: `${root}/outputs`,
      GITHUB_REF_NAME: "main",
      GITHUB_SHA: "HEAD",
      EVENT_NAME: event,
      REF_NAME: record,
      PUBLISH_PACKAGE: String(optIn),
    },
  });
  expect(result.status, result.stderr).toBe(0);
  return NodeFS.readFileSync(`${root}/outputs`, "utf8");
}

it.each([false, true])(
  "runs the actual plan step with --ref main and publish-package=%s",
  (optIn) => {
    const record = "t3code-lib@0.3.0";
    expect(runPlan("workflow_dispatch", record, optIn)).toBe(
      `record=${optIn ? record : ""}\nbuild-package=${optIn}\npublish=true\n`,
    );
  },
);

it("checks out the validated record in all package jobs and keeps the full verifier before builds", () => {
  for (const name of ["build", "npm", "github-release"]) {
    const job = publish.jobs[name]!;
    expect(job.needs).toContain("plan");
    const checkout = job.steps.find((step) => step.uses?.startsWith("actions/checkout@"))!;
    expect(checkout.with).toEqual({
      ref: "${{ needs.plan.outputs.record }}",
      "persist-credentials": false,
    });
    expect(JSON.stringify(job)).not.toContain("GITHUB_REF_NAME");
    expect(JSON.stringify(job)).not.toContain("github.ref_name");
  }
  const build = publish.jobs["build"]!;
  expect(build.if).toBe("needs.plan.outputs.build-package == 'true'");
  expect(build.env).toEqual({ RECORD: "${{ needs.plan.outputs.record }}" });
  const verify = build.steps.findIndex((step) => step.id === "version");
  expect(build.steps[verify]!.run).toBe(
    'scripts/release/verify-release-tag.sh "$RECORD"\necho "version=${RECORD#*@}" >> "$GITHUB_OUTPUT"\necho "unit=${RECORD%@*}" >> "$GITHUB_OUTPUT"\n',
  );
  for (const name of ["Setup Vite+", "Check", "Pack", "Upload the package"])
    expect(verify).toBeLessThan(build.steps.findIndex((step) => step.name === name));
  expect(build.outputs).toEqual({
    version: "${{ steps.version.outputs.version }}",
    unit: "${{ steps.version.outputs.unit }}",
  });
  const npm = publish.jobs["npm"]!;
  expect(npm.needs).toContain("build");
  const npmStep = npm.steps.find((step) => step.name === "Publish")!;
  expect(npmStep.env).toMatchObject({
    VERSION: "${{ needs.build.outputs.version }}",
    UNIT: "${{ needs.build.outputs.unit }}",
  });
  expect(npmStep.run).toBe(
    'scripts/release/ensure-npm.sh "$UNIT" "$VERSION" "$RUNNER_TEMP/package"',
  );
  const github = publish.jobs["github-release"]!;
  expect(github.needs).toEqual(["plan", "build", "npm"]);
  const releaseStep = github.steps.find(
    (step) => step.name === "Create or verify the GitHub Release",
  )!;
  expect(releaseStep.env?.["RECORD"]).toBe("${{ needs.plan.outputs.record }}");
  expect(releaseStep.run).toBe(
    'scripts/release/ensure-github-release.sh "$RECORD" "$RUNNER_TEMP/package"',
  );
});

it("preserves manual docs ref and feature inputs and waits for package publication when requested", () => {
  const docs = publish.jobs["docs"]!;
  expect(docs.needs).toEqual(["plan", "build", "npm", "github-release"]);
  expect(docs.if).toBe("${{ !cancelled() && !failure() && needs.plan.outputs.publish == 'true' }}");
  expect(docs.with).toEqual({
    ref: "${{ inputs.ref || github.ref_name }}",
    feature: "${{ inputs.feature || false }}",
    "feature-product": "${{ inputs.feature-product || '' }}",
    "feature-days": "${{ inputs.feature-days || '14' }}",
    "feature-reason": "${{ inputs.feature-reason || '' }}",
  });
});

it("dispatches only after the unchanged atomic push with the job token rather than the App credential", () => {
  const job = release.jobs["release"]!;
  expect(job.permissions).toEqual({ contents: "read", actions: "write" });
  const credential = job.steps.find((step) => step.id === "app-token")!;
  expect(credential.with?.["permission-contents"]).toBe("write");
  expect(credential.with).not.toHaveProperty("permission-actions");
  const push = job.steps.findIndex((step) => step.run?.includes("git push"));
  expect(push).toBeGreaterThan(0);
  const pushStep = job.steps[push]!;
  expect(pushStep.env?.["GH_TOKEN"]).toBe("${{ steps.app-token.outputs.token }}");
  expect(pushStep.run).toContain(
    'mapfile -t records < <(jq -r \'.tags[].name | "refs/tags/" + .\' "$RUNNER_TEMP/release-plan.json")',
  );
  expect(pushStep.run).toContain('git push --atomic origin HEAD:main "${records[@]}"');
  const dispatch = job.steps.findIndex((step) => step.run?.includes("dispatch-packages.sh"));
  expect(dispatch).toBeGreaterThan(push);
  expect(job.steps[dispatch]!.env).toEqual({ GH_TOKEN: "${{ github.token }}" });
  expect(job.steps[dispatch]!.run).toBe(
    'scripts/release/dispatch-packages.sh "$RUNNER_TEMP/release-plan.json"',
  );
  expect(job.steps[dispatch]).not.toHaveProperty("continue-on-error");
  expect(job).not.toHaveProperty("continue-on-error");
});

it.each([
  ["push", "t3code-cli@0.3.0", false, true],
  ["workflow_dispatch", "t3code-cli@0.3.0", true, true],
  ["workflow_dispatch", "t3code-cli@0.3.0", false, false],
  ["push", "t3code-cli@0.0.0", false, false],
  ["push", "t3code-lib@0.3.0", false, false],
  ["workflow_dispatch", "t3code-lib@0.3.0", true, false],
  ["push", "t3code-mcp@0.3.0", false, false],
  ["workflow_dispatch", "t3code-mcp@0.3.0", true, false],
  ["push", "t3c-docs@0.3.0", false, false],
  ["push", "t3mcp-docs@0.3.0", false, false],
  ["workflow_dispatch", "t3c-docs@0.3.0", false, false],
])("selects the tap job for %s %s with publish-package=%s: %s", (event, record, optIn, tap) => {
  const outputs = runPlan(event, record, optIn);
  const build = publish.jobs["build"]!;
  expect(build.if).toBe("needs.plan.outputs.build-package == 'true'");
  const builtUnit = outputs.includes("build-package=true\n")
    ? outputs.match(/^record=([^@\n]+)@/m)?.[1]
    : undefined;
  const condition = publish.jobs["publish-homebrew-tap"]!.if;
  const requiredUnit = condition?.match(/^needs\.build\.outputs\.unit == '([^']+)'$/)?.[1];
  expect(requiredUnit).toBe("t3code-cli");
  expect(builtUnit === requiredUnit).toBe(tap);
});

it("runs Homebrew after npm succeeds and uses its verified build artifact", () => {
  const tap = publish.jobs["publish-homebrew-tap"]!;
  expect(tap.needs).toEqual(["plan", "build", "npm"]);
  expect(tap.if).toBe("needs.build.outputs.unit == 't3code-cli'");
  expect(tap).not.toHaveProperty("continue-on-error");
  for (const step of tap.steps) expect(step).not.toHaveProperty("continue-on-error");
  const [sourceCheckout, download, tapCheckout, push] = tap.steps;
  expect(sourceCheckout?.with).toEqual({
    ref: "${{ github.workflow_sha }}",
    "persist-credentials": false,
  });
  const npmDownload = publish.jobs["npm"]!.steps.find(
    (step) => step.name === "Download the package",
  );
  expect(download?.with).toEqual(npmDownload?.with);
  expect(tapCheckout?.with).toEqual({
    repository: "wyrd-company/homebrew-tools",
    ref: "main",
    path: "homebrew-tools",
    "ssh-key": "${{ secrets.FORMULAE_PUBLISH_KEY }}",
  });
  expect(push?.env).toEqual({
    VERSION: "${{ needs.build.outputs.version }}",
    PUSH_TAP: "1",
  });
  expect(push?.run).toContain("scripts/publish-homebrew-tap.sh");
});

it("names Publish runs for the record and links them from the Release summary", () => {
  expect(publish["run-name"]).toBe("Publish ${{ inputs.ref || github.ref_name }}");
  const root = fixture();
  roots.push(root);
  const summary = `${root}/summary`;
  const step = release.jobs["release"]!.steps.find(
    (step) => step.name === "Link the publication runs",
  )!;
  const result = NodeChildProcess.spawnSync("bash", ["-eo", "pipefail", "-c", step.run!], {
    encoding: "utf8",
    env: {
      ...process.env,
      GITHUB_SERVER_URL: "https://github.example",
      GITHUB_REPOSITORY: "example/team",
      GITHUB_STEP_SUMMARY: summary,
    },
  });
  expect(result.status, result.stderr).toBe(0);
  expect(NodeFS.readFileSync(summary, "utf8")).toContain(
    "[Publish runs](https://github.example/example/team/actions/workflows/publish.yml)",
  );
});
