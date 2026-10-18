// ---
// relationships:
//   verifies: releasing
// ---
import * as NodeChildProcess from "node:child_process";
import * as NodeFS from "node:fs";
import * as NodePath from "node:path";
import { afterEach, expect, it } from "vite-plus/test";
import { parse, stringify } from "yaml";
import { fixture, write } from "./testSupport.ts";
const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0)) NodeFS.rmSync(root, { recursive: true, force: true });
});
it("Intentional applies the same release version to the npm and Claude plugin manifests", () => {
  const root = fixture();
  roots.push(root);
  const config = parse(
    NodeFS.readFileSync(new URL("../../.intentional/config.yml", import.meta.url), "utf8"),
  );
  config.discovery["managed-paths"] = config.discovery["managed-paths"].filter(
    (entry: { "release-unit": string }) => entry["release-unit"] === "t3code-mcp",
  );
  config["release-units"] = { "t3code-mcp": config["release-units"]["t3code-mcp"] };
  write(root, ".intentional/config.yml", stringify(config));
  for (const relative of ["package.json", ".claude-plugin/plugin.json"]) {
    write(
      root,
      `packages/t3code-mcp/${relative}`,
      NodeFS.readFileSync(
        new URL(`../../packages/t3code-mcp/${relative}`, import.meta.url),
        "utf8",
      ),
    );
  }
  const run = (command: string, args: string[]) => {
    const result = NodeChildProcess.spawnSync(command, args, {
      cwd: root,
      encoding: "utf8",
      env: {
        ...process.env,
        GIT_AUTHOR_NAME: "Sample",
        GIT_AUTHOR_EMAIL: "sample@example.invalid",
        GIT_COMMITTER_NAME: "Sample",
        GIT_COMMITTER_EMAIL: "sample@example.invalid",
      },
    });
    expect(result.status, result.stderr || result.stdout).toBe(0);
    return result.stdout;
  };
  run("git", ["init", "--quiet"]);
  run("git", ["add", "."]);
  run("git", [
    "-c",
    "core.hooksPath=/dev/null",
    "commit",
    "--quiet",
    "-m",
    "test: initial fixture",
  ]);
  run("intentional", ["tag", "--baseline"]);
  run("intentional", ["add", "--release-unit", "t3code-mcp:minor", "--message", "Sample release"]);
  run("intentional", ["apply"]);
  const version = (relative: string) =>
    (
      JSON.parse(
        NodeFS.readFileSync(NodePath.join(root, "packages/t3code-mcp", relative), "utf8"),
      ) as { version: string }
    ).version;
  expect(version("package.json")).toBe("0.1.0");
  expect(version(".claude-plugin/plugin.json")).toBe(version("package.json"));
});
