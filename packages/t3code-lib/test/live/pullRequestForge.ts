// ---
// relationships:
//   implements: library-testing
// ---
/**
 * A scratch server whose only forge is a local `glab` stub with one merge request,
 * number 7, and a project at a repository whose `origin` is on that forge. The stub
 * is `stubGitLabPullRequests.mjs`.
 */
import * as NodeURL from "node:url";
import { commandId, type ProjectId } from "../../src/schemas/common.ts";
import { createLocalForge } from "./localForge.ts";
import { startScratchServer, type PeerServer } from "./peerServer.ts";

const stub = NodeURL.fileURLToPath(new URL("./stubGitLabPullRequests.mjs", import.meta.url));

export const headSha = "1111111111111111111111111111111111111111";
export const repository = "sample/repository";
export const host = "gitlab.invalid";

export async function startPullRequestServer(project: ProjectId): Promise<PeerServer> {
  let workspaceRoot = "";
  const peer = await startScratchServer("t3code-lib-pull-requests-", async (home) => {
    const forge = await createLocalForge(home, [
      `  "api "*) exec node '${stub}' "$@" ;;`,
      `  "auth status") echo "Logged in to ${host} as sample-viewer" ;;`,
    ]);
    workspaceRoot = forge.cwd;
    return forge.environment;
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
    return peer;
  } catch (error) {
    await peer.stop();
    throw error;
  }
}
