// ---
// relationships:
//   implements: library-testing
// ---
/**
 * Local Git fixtures for live tests. A repository seeded here pushes to a local
 * bare repository. A local forge also has a `glab` script that answers the
 * server's calls, an `ssh` script that serves the bare repository, and a remote
 * host under `.invalid`, so that no call can leave this machine.
 */
import * as NodeCP from "node:child_process";
import * as NodeFSP from "node:fs/promises";
import * as NodePath from "node:path";

import { pathWith } from "./peerServer.ts";

/** Runs Git in a directory, with an identity, and returns its trimmed output. */
export type Git = (dir: string, ...args: string[]) => string;

const identity = ["-c", "user.name=Sample", "-c", "user.email=sample@example.invalid"];
const remoteUrl = "git@gitlab.invalid:sample/repository.git";

/** No inherited Git setting, such as a URL rewrite, can move the remote off the stub. */
export const isolatedGit = {
  GIT_CONFIG_GLOBAL: "/dev/null",
  GIT_CONFIG_NOSYSTEM: "1",
  GIT_CONFIG_COUNT: "0",
  GIT_CONFIG_PARAMETERS: "",
};

export function gitWith(environment: NodeJS.ProcessEnv = {}): Git {
  return (dir, ...args) =>
    NodeCP.execFileSync("git", ["-C", dir, ...identity, ...args], {
      encoding: "utf8",
      env: { ...process.env, ...environment },
    }).trim();
}

export function initBareRepository(path: string): void {
  NodeCP.execFileSync("git", ["init", "--bare", "--initial-branch=main", path]);
}

/** A repository at `cwd` with one commit of `sample.txt`, pushed to `remote`. */
export async function seedRepository(git: Git, cwd: string, remote: string): Promise<void> {
  git(cwd, "init", "--initial-branch=main");
  git(cwd, "remote", "add", "origin", remote);
  const resolved = git(cwd, "remote", "get-url", "origin");
  if (resolved !== remote) throw new Error("A Git setting moved the remote of the fixture.");
  // The server commits with the repository's identity.
  git(cwd, "config", "user.name", "Sample");
  git(cwd, "config", "user.email", "sample@example.invalid");
  await NodeFSP.writeFile(NodePath.join(cwd, "sample.txt"), "first\n");
  git(cwd, "add", "sample.txt");
  git(cwd, "commit", "-m", "Initial");
  git(cwd, "push", "--set-upstream", "origin", "main");
}

export interface LocalForge {
  readonly git: Git;
  /** The bare repository that the remote host serves. */
  readonly bare: string;
  /** A seeded repository whose `origin` is on the remote host. */
  readonly cwd: string;
  readonly sshCommand: string;
  /** The environment of a server that reaches this forge. */
  readonly environment: NodeJS.ProcessEnv;
}

/**
 * A forge under `root`, which the caller owns. `glabCases` are the arms of a
 * shell `case` on the first two arguments of the `glab` script.
 */
export async function createLocalForge(
  root: string,
  glabCases: readonly string[],
): Promise<LocalForge> {
  const bin = NodePath.join(root, "bin");
  await NodeFSP.mkdir(bin);
  const sshCommand = NodePath.join(bin, "ssh");
  await NodeFSP.writeFile(
    sshCommand,
    // Git calls this as `ssh [options] host command`. The command names the repository.
    `#!/bin/sh\nfor last; do :; done\ncd '${root}' && exec sh -c "$last"\n`,
    { mode: 0o755 },
  );
  await NodeFSP.writeFile(
    NodePath.join(bin, "glab"),
    [
      "#!/bin/sh",
      'case "$1 $2" in',
      ...glabCases,
      `  *) echo "unexpected glab call: $*" >&2; exit 64 ;;`,
      "esac",
      "",
    ].join("\n"),
    { mode: 0o755 },
  );
  const bare = NodePath.join(root, "sample", "repository.git");
  initBareRepository(bare);
  const cwd = NodePath.join(root, "work");
  await NodeFSP.mkdir(cwd);
  const git = gitWith({ ...isolatedGit, GIT_SSH_COMMAND: sshCommand });
  await seedRepository(git, cwd, remoteUrl);
  return {
    git,
    bare,
    cwd,
    sshCommand,
    environment: { ...isolatedGit, ...pathWith(bin), GIT_SSH_COMMAND: sshCommand },
  };
}
