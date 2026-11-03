// ---
// relationships:
//   verifies: proxy
// ---
import * as NodeFS from "node:fs";
import { describe, expect, it } from "vite-plus/test";
import { parse } from "yaml";

const read = (path: string) =>
  NodeFS.readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");
const feature = JSON.parse(read("features/src/t3code-proxy/devcontainer-feature.json")) as {
  id: string;
  options: Record<string, { default: string }>;
  dependsOn: Record<string, unknown>;
  installsAfter: string[];
};
const design = parse(read("docs/technical-designs/proxy.yml")) as {
  "proposed-design": Record<string, string>;
};
const readme = read("features/src/t3code-proxy/README.md");
const fragment = design["proposed-design"]["devcontainer-feature"]!;

describe("Feature metadata", () => {
  it("has the options and defaults of the design", () => {
    const rows = [...fragment.matchAll(/^\| `(\w+)`\s*\| `([^`]+)`/gm)].map((row) => [
      row[1],
      row[2],
    ]);
    expect(rows).toHaveLength(3);
    expect(Object.entries(feature.options).map(([name, option]) => [name, option.default])).toEqual(
      rows,
    );
  });
  it("installs after the Features whose services and files it reads", () => {
    for (const id of ["ansible", "caddy", "t3code-server"]) {
      expect(feature.installsAfter).toContain(`ghcr.io/wyrd-company/devcontainers/${id}`);
    }
    expect(Object.keys(feature.dependsOn)).toEqual(["ghcr.io/devcontainers/features/node:2"]);
  });
  it("shows the bind mount of the design in the README, with the default target", () => {
    const mount = /"(source=[^"]+)"/.exec(fragment)![1]!;
    expect(mount).toContain(`target=${feature.options["configPath"]!.default},`);
    expect(readme).toContain(mount);
  });
  it("documents every option in the README table", () => {
    for (const [name, option] of Object.entries(feature.options)) {
      expect(readme).toMatch(new RegExp(`\\| \`${name}\`\\s*\\| string \\| \`${option.default}\``));
    }
  });
  it("has the files of a Feature", () => {
    for (const file of ["install.sh", "README.md", "NOTES.md", "CHANGELOG.md", "logo.svg"]) {
      expect(read(`features/src/t3code-proxy/${file}`)).not.toBe("");
    }
  });
  it("keeps the scenarios on the pinned server version", () => {
    const pinned = (
      JSON.parse(read("packages/t3code-lib/package.json")) as {
        devDependencies: Record<string, string>;
      }
    ).devDependencies["t3"];
    const scenarios = read("features/test/t3code-proxy/scenarios.json");
    const versions = [...scenarios.matchAll(/"version": "([^"]+)"/g)].map((match) => match[1]);
    expect(versions.length).toBeGreaterThan(0);
    expect(new Set(versions)).toEqual(new Set([pinned]));
  });
});
