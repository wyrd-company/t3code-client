// ---
// relationships:
//   verifies: releasing
// ---
import * as NodeChildProcess from "node:child_process";
import * as NodeFS from "node:fs";
import * as NodeOS from "node:os";
import * as NodePath from "node:path";

export function fixture() {
  const root = NodeFS.mkdtempSync(NodePath.join(NodeOS.tmpdir(), "release-test-"));
  NodeFS.cpSync(new URL("./", import.meta.url), NodePath.join(root, "scripts/release"), {
    recursive: true,
  });
  return root;
}

export function write(root: string, file: string, content: string) {
  const path = NodePath.join(root, file);
  NodeFS.mkdirSync(NodePath.dirname(path), { recursive: true });
  NodeFS.writeFileSync(path, content);
}

export function run(
  root: string,
  script: string,
  args: string[] = [],
  env: NodeJS.ProcessEnv = {},
) {
  return NodeChildProcess.spawnSync(
    "bash",
    [NodePath.join(root, "scripts/release", script), ...args],
    {
      cwd: root,
      encoding: "utf8",
      env: { ...process.env, ...env },
    },
  );
}

export function fake(root: string, name: string, content: string) {
  write(root, `bin/${name}`, `#!/usr/bin/env bash\nset -eu\n${content}\n`);
  NodeFS.chmodSync(NodePath.join(root, "bin", name), 0o755);
  return { PATH: `${root}/bin:${process.env["PATH"]}` };
}

export function manifest(root: string, unit: string, extra: Record<string, unknown> = {}) {
  write(
    root,
    `packages/${unit}/package.json`,
    JSON.stringify({
      name: `@wyrd-company/${unit}`,
      version: "0.1.0",
      ...extra,
    }),
  );
}

export function tarball(root: string, unit: string, files: Record<string, string> = {}) {
  const dir = NodePath.join(root, "archive");
  const archiveFiles = {
    "package.json": JSON.stringify({ name: `@wyrd-company/${unit}`, version: "0.1.0" }),
    "dist/index.js": "export {};",
    "dist/index.d.ts": "export {};",
    LICENSE: "MIT",
    "README.md": "Package",
    ...files,
  };
  for (const [file, contents] of Object.entries(archiveFiles))
    write(dir, `package/${file}`, contents);
  const path = NodePath.join(root, `wyrd-company-${unit}-0.1.0.tgz`);
  NodeChildProcess.execFileSync("tar", ["-czf", path, "-C", dir, "package"]);
  return path;
}
