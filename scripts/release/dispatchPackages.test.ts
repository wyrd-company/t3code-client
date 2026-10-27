// ---
// relationships:
//   verifies: releasing
// ---
import * as NodeFS from "node:fs";
import { afterEach, expect, it } from "vite-plus/test";
import { fake, fixture, run, write } from "./testSupport.ts";

const roots: string[] = [];
const records = [
  "t3code-lib@0.3.0",
  "t3code-cli@0.2.0",
  "t3code-mcp@0.1.0",
  "t3c-docs@0.3.0",
  "t3mcp-docs@0.1.0",
];
afterEach(() => {
  for (const root of roots.splice(0)) NodeFS.rmSync(root, { recursive: true, force: true });
});
function setup(names = records) {
  const root = fixture();
  roots.push(root);
  write(
    root,
    "plan.json",
    JSON.stringify({ tags: names.map((name) => ({ name, release_unit: name.split("@")[0] })) }),
  );
  const env = fake(
    root,
    "gh",
    `
    printf '%s\\n' "$*" >> calls
    [[ "$*" != *"\${FAIL_RECORD:-never}"* ]] || exit 23
  `,
  );
  const calls = () =>
    NodeFS.existsSync(`${root}/calls`)
      ? NodeFS.readFileSync(`${root}/calls`, "utf8").trim().split("\n")
      : [];
  return { root, env, calls };
}

it("dispatches exactly three npm records for five atomically pushed records", () => {
  const { root, env, calls } = setup();
  const result = run(root, "dispatch-packages.sh", ["plan.json"], env);
  expect(result.status, result.stderr).toBe(0);
  expect(calls()).toEqual(
    records
      .slice(0, 3)
      .map(
        (record) =>
          `workflow run publish.yml --ref ${record} -f ref=${record} -f publish-package=true`,
      ),
  );
});

it.each([0, 1, 2, 3])("leaves %s records to ordinary push events without dispatch", (count) => {
  const { root, env, calls } = setup(records.slice(0, count));
  const result = run(root, "dispatch-packages.sh", ["plan.json"], env);
  expect(result.status, result.stderr).toBe(0);
  expect(calls()).toEqual([]);
});

it("counts docs and baseline tags toward suppression but dispatches neither", () => {
  const { root, env, calls } = setup(["t3code-lib@0.0.0", ...records.slice(1)]);
  const result = run(root, "dispatch-packages.sh", ["plan.json"], env);
  expect(result.status, result.stderr).toBe(0);
  expect(calls()).toHaveLength(2);
  expect(calls().join("\n")).not.toMatch(/t3code-lib|t3c-docs|t3mcp-docs/);
});

it.each([
  {
    tags: records
      .map((name) => ({ name, release_unit: name.split("@")[0] }))
      .concat({ name: "t3code-lib@next", release_unit: "t3code-lib" }),
  },
  { tags: [{ name: "t3code-client@0.1.0", release_unit: "t3code-client" }] },
  { tags: [{ name: "t3code-lib@0.1.0", release_unit: "t3code-cli" }] },
  {
    tags: [
      { name: "t3code-lib@0.1.0", release_unit: "t3code-lib" },
      { name: "t3code-lib@0.1.0", release_unit: "t3code-lib" },
    ],
  },
  { tags: [null] },
  {},
  { tags: "invalid" },
])("rejects malformed saved records before the first gh call: %j", (plan) => {
  const { root, env, calls } = setup();
  write(root, "plan.json", JSON.stringify(plan));
  const result = run(root, "dispatch-packages.sh", ["plan.json"], env);
  expect(result.status).not.toBe(0);
  expect(calls()).toEqual([]);
});

it("propagates gh failure and stops dispatching so selected records can be retried", () => {
  const { root, env, calls } = setup();
  const result = run(root, "dispatch-packages.sh", ["plan.json"], {
    ...env,
    FAIL_RECORD: records[1],
  });
  expect(result.status).toBe(23);
  expect(calls()).toHaveLength(2);
  expect(calls()[1]).toContain("t3code-cli@0.2.0");
});
