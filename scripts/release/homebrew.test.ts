// ---
// relationships:
//   verifies: releasing
// ---
import * as NodeChildProcess from "node:child_process";
import * as NodeCrypto from "node:crypto";
import * as NodeFS from "node:fs";
import * as NodePath from "node:path";
import { pathToFileURL } from "node:url";
import { afterEach, describe, expect, it } from "vite-plus/test";
import { fixture, tarball } from "./testSupport.ts";
const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0)) NodeFS.rmSync(root, { recursive: true, force: true });
});
function render(
  unit = "t3code-cli",
  url?: string,
  local = false,
  extra: Record<string, unknown> = {},
) {
  const root = fixture();
  roots.push(root);
  const archive = tarball(root, unit, {
    "package.json": JSON.stringify({ name: `@wyrd-company/${unit}`, version: "0.1.0", ...extra }),
  });
  const output = NodePath.join(root, "t3c.rb");
  const source =
    url ?? "https://registry.npmjs.org/@wyrd-company/t3code-cli/-/t3code-cli-0.1.0.tgz";
  const args = [
    NodePath.join(root, "scripts/release/render-homebrew.py"),
    archive,
    local ? pathToFileURL(archive).href : source,
    output,
  ];
  if (local) args.push("--local-library", tarball(root, "t3code-lib"));
  const result = NodeChildProcess.spawnSync("python3", args, { encoding: "utf8" });
  return { result, archive, output, source };
}
describe("Homebrew formula generation", () => {
  it("derives version and SHA256 from actual CLI npm bytes", () => {
    const { result, archive, output, source } = render();
    expect(result.status, result.stderr).toBe(0);
    const formula = NodeFS.readFileSync(output, "utf8");
    expect(formula).toContain(`url "${source}"`);

    expect(formula).toContain(
      NodeCrypto.createHash("sha256").update(NodeFS.readFileSync(archive)).digest("hex"),
    );
    expect(formula).toContain('depends_on "node"');
    expect(formula).toContain('system "npm", "install", *std_npm_args');
    expect(formula).toContain('bin.install_symlink Dir["#{libexec}/bin/*"]');
  });
  it("rejects another package identity", () => {
    expect(render("other").result.status).not.toBe(0);
  });
  it("rejects a source URL that does not match the package version", () => {
    expect(
      render(
        "t3code-cli",
        "https://registry.npmjs.org/@wyrd-company/t3code-cli/-/t3code-cli-0.2.0.tgz",
      ).result.status,
    ).not.toBe(0);
  });
  it("rejects private packages", () => {
    expect(render("t3code-cli", undefined, false, { private: true }).result.status).not.toBe(0);
  });
  it("rejects malformed package versions", () => {
    expect(
      render(
        "t3code-cli",
        "https://registry.npmjs.org/@wyrd-company/t3code-cli/-/t3code-cli-invalid.tgz",
        false,
        { version: "invalid" },
      ).result.status,
    ).not.toBe(0);
  });
  it("renders local artifact installation with the matching library", () => {
    const { result, output } = render("t3code-cli", undefined, true);
    expect(result.status, result.stderr).toBe(0);
    expect(NodeFS.readFileSync(output, "utf8")).toContain("wyrd-company-t3code-lib-0.1.0.tgz");
  });
});
