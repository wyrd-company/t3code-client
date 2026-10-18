// ---
// relationships:
//   verifies: releasing
// ---
import * as NodeFS from "node:fs";
import * as NodeChildProcess from "node:child_process";
import { afterEach, describe, expect, it } from "vite-plus/test";
import { fake, fixture, manifest, run, tarball, write } from "./testSupport.ts";

const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0)) NodeFS.rmSync(root, { recursive: true, force: true });
});
function setup(unit = "t3code-lib", files: Record<string, string> = {}) {
  const root = fixture();
  roots.push(root);
  manifest(root, unit);
  const surface = JSON.stringify({
    tool: { name: "sample", mode: "non-interactive" },
    commands: [{ name: "run" }],
  });
  if (unit === "t3code-cli") write(root, "docs/specifications/cli-surface.json", surface);
  tarball(root, unit, {
    ...(unit === "t3code-cli" ? { "commandSurface.json": surface } : {}),
    ...files,
  });
  const env = fake(root, "pnpm", "exit 0");
  return { root, env };
}

describe("package boundary", () => {
  it("rejects unknown units before any package operation", () => {
    const { root } = setup();
    const result = NodeChildProcess.spawnSync(
      "bash",
      [
        "-c",
        'source "$1"; release_unit "$2"',
        "bash",
        `${root}/scripts/release/unit.sh`,
        "t3code-client",
      ],
      { encoding: "utf8" },
    );
    expect(result.status).not.toBe(0);
  });
  it("packs the selected library and rejects the retired package identity", () => {
    const { root, env } = setup();
    expect(run(root, "verify-package.sh", ["t3code-lib", root], env).status).toBe(0);
    manifest(root, "t3code-lib", { name: "@wyrd-company/t3code-client" });
    expect(run(root, "verify-package.sh", ["t3code-lib", root], env).status).not.toBe(0);
    expect(run(root, "verify-package.sh", ["t3code-client", root], env).status).not.toBe(0);
  });
  it("refuses private packages", () => {
    const { root, env } = setup();
    manifest(root, "t3code-lib", { private: true });
    expect(run(root, "verify-package.sh", ["t3code-lib", root], env).status).not.toBe(0);
  });
  it("requires declaration output and excludes source/test output", () => {
    const { root, env } = setup();
    NodeFS.unlinkSync(`${root}/archive/package/dist/index.d.ts`);
    // Repack the exact fixture after removing a required member.
    fake(
      root,
      "tar",
      'if [[ "$1" == -tzf ]]; then printf "%s\\n" package/package.json package/dist/index.js package/LICENSE package/README.md; else exit 1; fi',
    );
    expect(run(root, "verify-package.sh", ["t3code-lib", root], env).status).not.toBe(0);
    const leaked = setup("t3code-lib", { "src/internal.ts": "export {};" });
    expect(
      run(leaked.root, "verify-package.sh", ["t3code-lib", leaked.root], leaked.env).status,
    ).not.toBe(0);
  });
  it("requires CLI shrinkwrap and rejects workspace resolutions", () => {
    const { root, env } = setup("t3code-cli", { "dist/cli.js": "#!/usr/bin/env node" });
    expect(run(root, "verify-package.sh", ["t3code-cli", root], env).status).not.toBe(0);
    tarball(root, "t3code-cli", {
      "dist/cli.js": "#!/usr/bin/env node",
      "npm-shrinkwrap.json": JSON.stringify({
        name: "@wyrd-company/t3code-cli",
        version: "0.1.0",
        packages: { "node_modules/sample": { resolved: "workspace:*" } },
      }),
    });
    expect(run(root, "verify-package.sh", ["t3code-cli", root], env).status).not.toBe(0);
  });
  it("rejects shrinkwrap identity disagreement", () => {
    for (const override of [{ name: "@wyrd-company/sample" }, { version: "0.2.0" }]) {
      const { root, env } = setup("t3code-cli", {
        "dist/cli.js": "#!/usr/bin/env node",
        "npm-shrinkwrap.json": JSON.stringify({
          name: "@wyrd-company/t3code-cli",
          version: "0.1.0",
          packages: {},
          ...override,
        }),
      });
      expect(run(root, "verify-package.sh", ["t3code-cli", root], env).status).not.toBe(0);
    }
  });
  it("accepts CLI shrinkwrap with matching identity and registry resolution", () => {
    const { root, env } = setup("t3code-cli", {
      "dist/cli.js": "#!/usr/bin/env node",
      "npm-shrinkwrap.json": JSON.stringify({
        name: "@wyrd-company/t3code-cli",
        version: "0.1.0",
        packages: {},
      }),
    });
    expect(run(root, "verify-package.sh", ["t3code-cli", root], env).status).toBe(0);
  });
  it("rejects a packed CLI command surface that differs from the complete canonical source", () => {
    const { root, env } = setup("t3code-cli", {
      "dist/cli.js": "#!/usr/bin/env node",
      "npm-shrinkwrap.json": JSON.stringify({
        name: "@wyrd-company/t3code-cli",
        version: "0.1.0",
        packages: {},
      }),
      "commandSurface.json": JSON.stringify({ commands: [] }),
    });
    const result = run(root, "verify-package.sh", ["t3code-cli", root], env);
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("Packed CLI command surface differs from canonical source.");
  });
  it("requires the command surface inside the CLI tarball", () => {
    const { root, env } = setup("t3code-cli", {
      "dist/cli.js": "#!/usr/bin/env node",
      "npm-shrinkwrap.json": JSON.stringify({
        name: "@wyrd-company/t3code-cli",
        version: "0.1.0",
        packages: {},
      }),
    });
    NodeFS.unlinkSync(`${root}/archive/package/commandSurface.json`);
    tarball(root, "t3code-cli");
    const result = run(root, "verify-package.sh", ["t3code-cli", root], env);
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("Package is missing package/commandSurface.json.");
  });
  it("refuses a publication tarball with a different version or private flag", () => {
    for (const override of [{ version: "0.2.0" }, { private: true }]) {
      const { root } = setup();
      tarball(root, "t3code-lib", {
        "package.json": JSON.stringify({
          name: "@wyrd-company/t3code-lib",
          version: "0.1.0",
          ...override,
        }),
      });
      const env = fake(root, "npm", 'touch "$PWD/npm-invoked"; exit 0');
      expect(run(root, "ensure-npm.sh", ["t3code-lib", "0.1.0", root], env).status).not.toBe(0);
      expect(NodeFS.existsSync(`${root}/npm-invoked`)).toBe(false);
    }
  });
  it("refuses a mislabeled publication tarball before invoking npm", () => {
    const { root } = setup();
    tarball(root, "t3code-lib", {
      "package.json": JSON.stringify({ name: "@wyrd-company/t3code-client", version: "0.1.0" }),
    });
    const env = fake(root, "npm", 'touch "$PWD/npm-invoked"; exit 0');
    expect(run(root, "ensure-npm.sh", ["t3code-lib", "0.1.0", root], env).status).not.toBe(0);
    expect(NodeFS.existsSync(`${root}/npm-invoked`)).toBe(false);
  });
});

describe("MCP package boundary", () => {
  it("requires the plugin manifests, public module and executable without CLI shrinkwrap", () => {
    const files = {
      "dist/cli.js": "#!/usr/bin/env node",
      ".claude-plugin/plugin.json": "{}",
      ".mcp.json": "{}",
    };
    const accepted = setup("t3code-mcp", files);
    expect(
      run(accepted.root, "verify-package.sh", ["t3code-mcp", accepted.root], accepted.env).status,
    ).toBe(0);
    for (const missing of Object.keys(files)) {
      const fixtureFiles = Object.fromEntries(
        Object.entries(files).filter(([key]) => key !== missing),
      );
      const rejected = setup("t3code-mcp", fixtureFiles);
      expect(
        run(rejected.root, "verify-package.sh", ["t3code-mcp", rejected.root], rejected.env).status,
      ).not.toBe(0);
    }
  });
});
