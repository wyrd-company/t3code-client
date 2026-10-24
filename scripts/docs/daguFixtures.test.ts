// ---
// relationships:
//   verifies: documentation
//   references: command-line, dagu, testing
// ---
import * as NodeFS from "node:fs";
import { expect, it } from "vite-plus/test";
import { parse } from "yaml";

const guide = NodeFS.readFileSync(new URL("../../docs/user/t3c/dagu.md", import.meta.url), "utf8");
const fixture = (name: string): Record<string, unknown> =>
  parse(NodeFS.readFileSync(new URL(`../dagu/${name}.yaml`, import.meta.url), "utf8")) as Record<
    string,
    unknown
  >;

it("keeps documented Dagu JSON inputs within the actual new-run and continuation interfaces", () => {
  const inputs = [...guide.matchAll(/--params '([^']+)'/gu)].map(
    ([, json]) => JSON.parse(json!) as Record<string, string>,
  );
  expect(inputs).toHaveLength(3);
  const cases = ["verification", "continuation", "verification"];
  for (const [index, input] of inputs.entries()) {
    const spec = fixture(cases[index]!);
    const defaults = Object.assign({}, ...(spec["params"] as Record<string, string>[])) as Record<
      string,
      string
    >;
    expect(Object.keys(input).sort()).toEqual(Object.keys(defaults).sort());
    expect(input["PROMPT"]).not.toBe("");
    expect(input["TIMEOUT"]).toBe(index === 2 ? "1s" : "120s");
    const step = (spec["steps"] as Record<string, unknown>[])[0]!;
    const withArgs = step["with"] as Record<string, string>;
    expect(step["action"]).toBe("harness.run");
    expect(withArgs["model"]).toBe("gpt-6-luna");
    expect(withArgs["timeout"]).toBe("${params.TIMEOUT}");
    expect(withArgs["prompt"]).toBe("${params.PROMPT}");
    if (index === 1) {
      expect(input["THREAD"]).toBe("<thread-id>");
      expect(withArgs["thread"]).toBe("${params.THREAD}");
      expect(withArgs).not.toHaveProperty("project-path");
      expect(input).not.toHaveProperty("PROJECT");
    } else {
      expect(input["PROJECT"]).toMatch(/^\//u);
      expect(withArgs["project-path"]).toBe("${params.PROJECT}");
    }
    expect(spec["harnesses"]).toEqual({
      sample: { binary: "t3c", prefix_args: ["run"], prompt_mode: "stdin" },
    });
    expect(spec["secrets"]).toEqual([
      { name: "T3_TOKEN", provider: "env", key: "SAMPLE_T3_TOKEN" },
      { name: "T3_SERVER_URL", provider: "env", key: "SAMPLE_T3_SERVER_URL" },
    ]);
  }
});
