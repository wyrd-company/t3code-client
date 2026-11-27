// ---
// relationships:
//   verifies: releasing
// ---
import * as NodeChildProcess from "node:child_process";
import { once } from "node:events";
import * as NodeFS from "node:fs";
import * as NodeHttp from "node:http";
import * as NodePath from "node:path";
import { promisify } from "node:util";
import { afterEach, expect, it } from "vite-plus/test";
import { fake, fixture, tarball, write } from "./testSupport.ts";

const formula = "Formula/t3c.rb";
const registryPrefix = "https://registry.npmjs.org/@wyrd-company/t3code-cli/-/t3code-cli-";
const url = `${registryPrefix}0.1.0.tgz`;
const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0)) NodeFS.rmSync(root, { recursive: true, force: true });
});

function prepare(currentVersion = "0.0.9") {
  const root = fixture();
  roots.push(root);
  const script = NodePath.join(root, "scripts/publish-homebrew-tap.sh");
  NodeFS.copyFileSync(new URL("../publish-homebrew-tap.sh", import.meta.url), script);
  const archive = tarball(root, "t3code-cli");
  const remote = NodePath.join(root, "remote");
  const tap = NodePath.join(root, "tap");
  const git = (args: string[], cwd = tap) =>
    NodeChildProcess.execFileSync("git", args, {
      cwd,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
  const configure = (cwd = tap) => {
    git(["config", "user.name", "Example"], cwd);
    git(["config", "user.email", "example@example.invalid"], cwd);
  };
  git(["init", "--bare", "--initial-branch=main", remote], root);
  git(["clone", remote, tap], root);
  configure();
  git(["switch", "-c", "validation"]);
  write(tap, formula, `class T3c < Formula\n  url "${registryPrefix}${currentVersion}.tgz"\nend\n`);
  git(["add", formula]);
  git(["commit", "-m", "chore: initialize test"]);
  git(["push", "origin", "HEAD:main"]);
  const remoteHead = () => git(["rev-parse", "main"], remote).trim();
  const snapshot = () => ({
    head: git(["rev-parse", "HEAD"]).trim(),
    index: NodeFS.readFileSync(NodePath.join(tap, ".git/index")).toString("hex"),
    formula: NodeFS.readFileSync(NodePath.join(tap, formula), "utf8"),
  });
  const curl = fake(root, "curl", 'for last; do :; done\ncp "$SOURCE" "$last"');
  const options = (env: NodeJS.ProcessEnv) => ({
    env: { ...process.env, ...curl, SOURCE: archive, PUSH_TAP: "1", ...env },
    encoding: "utf8" as const,
  });
  const run = (env: NodeJS.ProcessEnv = {}, checkout = tap) =>
    NodeChildProcess.spawnSync("bash", [script, archive, url, checkout], options(env));
  return { root, script, archive, remote, tap, git, configure, remoteHead, snapshot, options, run };
}

it("pushes the verified formula to tap main and replays without a new commit", () => {
  const { run, snapshot, git, remoteHead } = prepare();
  const before = remoteHead();
  const result = run();
  expect(result.status, result.stderr).toBe(0);
  const after = remoteHead();
  expect(after).not.toBe(before);
  expect(git(["show", `HEAD:${formula}`])).toBe(snapshot().formula);
  expect(snapshot().head).toBe(after);
  expect(git(["status", "--porcelain"])).toBe("");
  expect(snapshot().formula).toContain(url);
  const retry = run();
  expect(retry.status, retry.stderr).toBe(0);
  expect(retry.stdout).toContain("already up to date");
  expect(remoteHead()).toBe(after);
  expect(snapshot().head).toBe(after);
});

it("preserves formula bytes HEAD and index when published URL bytes differ", () => {
  const { root, tap, git, run, snapshot, remoteHead } = prepare();
  write(tap, formula, "original staged formula\n");
  git(["add", formula]);
  write(tap, formula, "original working formula\n");
  const before = snapshot();
  write(root, "download.tgz", "different published bytes");
  const result = run({ SOURCE: NodePath.join(root, "download.tgz") });
  expect(result.status).toBe(1);
  expect(result.stderr).toContain("Registry tarball differs");
  expect(snapshot()).toEqual(before);
  expect(remoteHead()).toBe(before.head);
});

it("preserves a newer formula when retrying an old CLI record", () => {
  const { run, snapshot, remoteHead } = prepare("0.10.0");
  const before = snapshot();
  const result = run();
  expect(result.status, result.stderr).toBe(0);
  expect(result.stdout).toContain("already tracks newer t3c 0.10.0");
  expect(snapshot().head).toBe(before.head);
  expect(snapshot().formula).toBe(before.formula);
  expect(remoteHead()).toBe(before.head);
});

it("rejects an existing formula for the same version with a different checksum", () => {
  const { run, snapshot, remoteHead } = prepare("0.1.0");
  const before = snapshot();
  const result = run();
  expect(result.status).not.toBe(0);
  expect(result.stderr).toContain("tap formula checksum differs");
  expect(snapshot().head).toBe(before.head);
  expect(snapshot().formula).toBe(before.formula);
  expect(remoteHead()).toBe(before.head);
});

it("fails visibly when registry retries are exhausted", () => {
  const { root, run, snapshot, remoteHead } = prepare();
  const before = snapshot();
  const env = fake(root, "curl", "exit 22");
  const result = run(env);
  expect(result.status).toBe(1);
  expect(result.stderr).toContain("Registry tarball unavailable after retries");
  expect(snapshot()).toEqual(before);
  expect(remoteHead()).toBe(before.head);
});

it("waits for the registry when the tarball is initially missing", async () => {
  const { root, script, archive, tap, remoteHead, options } = prepare();
  const before = remoteHead();
  const curl = NodeChildProcess.execFileSync("sh", ["-c", "command -v curl"], {
    encoding: "utf8",
  }).trim();
  const bytes = NodeFS.readFileSync(archive);
  let requests = 0;
  const server = NodeHttp.createServer((_request, response) => {
    if (++requests === 1) response.writeHead(404).end();
    else response.end(bytes);
  }).listen(0, "127.0.0.1");
  try {
    await once(server, "listening");
    const address = server.address();
    if (address === null || typeof address === "string") throw new Error("Expected a test port");
    const env = fake(
      root,
      "curl",
      `
      args=()
      while (( $# )); do
        case "$1" in
          --retry-delay) test "$2" = 30; args+=("$1" 1); shift ;;
          "${url}") args+=("http://127.0.0.1:${address.port}/tarball") ;;
          *) args+=("$1") ;;
        esac
        shift
      done
      exec "$CURL" "\${args[@]}"
    `,
    );
    await promisify(NodeChildProcess.execFile)("bash", [script, archive, url, tap], {
      ...options({ ...env, CURL: curl }),
      timeout: 3500,
    });
    expect(requests).toBe(2);
    expect(remoteHead()).not.toBe(before);
  } finally {
    server.close();
  }
});

it("reports a rejected tap push and can retry from a fresh checkout", () => {
  const { root, remote, run, git, configure, snapshot, remoteHead } = prepare();
  const before = remoteHead();
  const hook = "hooks/pre-receive";
  write(remote, hook, "#!/usr/bin/env bash\nexit 1\n");
  NodeFS.chmodSync(NodePath.join(remote, hook), 0o755);
  const rejected = run();
  expect(rejected.status).not.toBe(0);
  expect(rejected.stderr).toContain("remote rejected");
  expect(rejected.stdout).not.toContain("Published the Homebrew formula");
  expect(remoteHead()).toBe(before);
  expect(snapshot().head).not.toBe(before);

  NodeFS.unlinkSync(NodePath.join(remote, hook));
  const fresh = NodePath.join(root, "fresh");
  git(["clone", remote, fresh], root);
  configure(fresh);
  const retry = run({}, fresh);
  expect(retry.status, retry.stderr).toBe(0);
  expect(remoteHead()).not.toBe(before);
});
