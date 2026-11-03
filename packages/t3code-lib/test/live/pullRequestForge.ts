// ---
// relationships:
//   implements: library-testing
// ---
/**
 * A scratch server whose only forge is a local `glab` stub with one merge request,
 * number 7, and a project at a repository whose `origin` is on that forge. The merge
 * request's commits are real, on the branch `sample-change`. The stub is
 * `stubGitLabPullRequests.mjs`. With `T3_LIVE_AGENT=1`, the server uses the Codex
 * profile of the test run.
 */
import * as NodeFSP from "node:fs/promises";
import * as NodePath from "node:path";
import * as NodeURL from "node:url";
import { commandId, type ProjectId } from "../../src/schemas/common.ts";
import { createLocalForge } from "./localForge.ts";
import { hasAgent } from "./liveClient.ts";
import { startScratchServer, type PeerServer } from "./peerServer.ts";

const stub = NodeURL.fileURLToPath(new URL("./stubGitLabPullRequests.mjs", import.meta.url));

export const repository = "sample/repository";
export const host = "gitlab.invalid";

/** What the stub received for a write: an API call or an `mr` command. */
export type ForgeCall =
  | { readonly method: string; readonly path: string; readonly body?: unknown }
  | { readonly args: readonly string[] };

export interface PullRequestServer extends PeerServer {
  readonly headSha: string;
  /** Changes the merge request's title on the forge, as another person can. */
  setForgeTitle(title: string): Promise<void>;
  /** The writes the forge received since the last time this was called. */
  takeForgeCalls(): Promise<readonly ForgeCall[]>;
}

export async function startPullRequestServer(project: ProjectId): Promise<PullRequestServer> {
  let workspaceRoot = "";
  let forgeRoot = "";
  let headSha = "";
  let baseSha = "";
  const peer = await startScratchServer("t3code-lib-pull-requests-", async (home) => {
    forgeRoot = home;
    const forge = await createLocalForge(home, [
      `  "api "*|"mr "*) STUB_FORGE_ROOT='${home}' exec node '${stub}' "$@" ;;`,
      `  "auth status") echo "Logged in to ${host} as sample-viewer" ;;`,
    ]);
    workspaceRoot = forge.cwd;
    baseSha = forge.git(forge.cwd, "rev-parse", "HEAD");
    forge.git(forge.cwd, "switch", "--create", "sample-change");
    await NodeFSP.writeFile(NodePath.join(forge.cwd, "sample.txt"), "second\n");
    forge.git(forge.cwd, "commit", "--all", "--message", "Sample change");
    forge.git(forge.cwd, "push", "origin", "sample-change");
    headSha = forge.git(forge.cwd, "rev-parse", "HEAD");
    forge.git(forge.cwd, "switch", "main");
    await NodeFSP.writeFile(
      NodePath.join(home, "forge.json"),
      JSON.stringify({ headSha, baseSha, title: "Sample change" }),
    );
    const profile = process.env["CODEX_HOME"];
    if (hasAgent && profile) await NodeFSP.symlink(profile, NodePath.join(home, ".codex"));
    return forge.environment;
  });
  const callsFile = NodePath.join(forgeRoot, "calls.jsonl");
  const server = Object.assign(peer, {
    headSha,
    setForgeTitle: (title: string) =>
      NodeFSP.writeFile(
        NodePath.join(forgeRoot, "forge.json"),
        JSON.stringify({ headSha, baseSha, title }),
      ),
    takeForgeCalls: async () => {
      const text = await NodeFSP.readFile(callsFile, "utf8").catch(() => "");
      await NodeFSP.rm(callsFile, { force: true });
      return text
        .split("\n")
        .filter((line) => line !== "")
        .map((line) => JSON.parse(line) as ForgeCall);
    },
  });
  try {
    await peer.client.routes.call("projects.mutate", {
      body: {
        type: "project.create",
        commandId: commandId(`command-${crypto.randomUUID()}`),
        projectId: project,
        title: "Sample project",
        workspaceRoot,
      },
    });
    return server;
  } catch (error) {
    await peer.stop();
    throw error;
  }
}
