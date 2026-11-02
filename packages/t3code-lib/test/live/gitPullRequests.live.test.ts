// ---
// relationships:
//   verifies: library-wire
// ---
/** Pull request methods on a real stock server, with a local forge. */
import * as NodeCP from "node:child_process";
import * as NodeCrypto from "node:crypto";
import * as NodeFSP from "node:fs/promises";
import * as NodeHttp from "node:http";
import type * as NodeNet from "node:net";
import * as NodeOS from "node:os";
import * as NodePath from "node:path";
import * as NodeUtil from "node:util";
import { afterAll, beforeAll, describe, expect, it } from "vite-plus/test";
import { schemas, type T3Client } from "../../src/index.ts";
import { hasAgent, hasLiveServer, modelSelection } from "./liveClient.ts";
import { createLocalForge, isolatedGit, type Git } from "./localForge.ts";
import { startPeerServer, type PeerServer } from "./peerServer.ts";

const execFile = NodeUtil.promisify(NodeCP.execFile);
/** Answers for one merge request, with the fields the server's decoder requires. */
const mergeRequest = (headSha: string, iid = 7, branch = "sample-change") => ({
  iid,
  title: "Sample change",
  web_url: `https://gitlab.invalid/sample/repository/-/merge_requests/${iid}`,
  source_branch: branch,
  target_branch: "main",
  sha: headSha,
  state: "opened",
  created_at: "2026-01-01T00:00:00.000Z",
  updated_at: "2026-01-01T00:00:00.000Z",
});

describe.skipIf(!hasLiveServer)("pull request methods with a local forge stub", () => {
  let root: string;
  let cwd: string;
  let answer: string;
  let created: string;
  let createCall: string;
  let peer: PeerServer;
  let client: T3Client;
  let git: Git;
  let sshCommand: string;

  beforeAll(async () => {
    root = await NodeFSP.mkdtemp(NodePath.join(NodeOS.tmpdir(), "t3code-lib-forge-"));
    answer = NodePath.join(root, "merge-request.json");
    created = NodePath.join(root, "created.json");
    createCall = NodePath.join(root, "create-call.txt");
    const forge = await createLocalForge(root, [
      `  "mr view") cat '${answer}' ;;`,
      `  "mr list")`,
      // The server calls this as `mr list --source-branch <branch> ...`.
      `    if [ "$4" = agent-change ]; then`,
      `      if [ -f '${created}' ]; then printf '['; cat '${created}'; printf ']'; else echo '[]'; fi`,
      `    else printf '['; cat '${answer}'; printf ']'; fi ;;`,
      `  "api --method") printf '%s\n' "$*" > '${createCall}'; printf '{"iid":8}' ;;`,
      `  "mr checkout") git fetch origin refs/merge-requests/7/head:sample-change && git switch sample-change ;;`,
      `  "api "*) printf '{"default_branch":"main"}' ;;`,
      `  "auth status") echo "Logged in to gitlab.invalid as sample" ;;`,
    ]);
    ({ git, cwd, sshCommand } = forge);
    git(cwd, "switch", "--create", "sample-change");
    await NodeFSP.writeFile(NodePath.join(cwd, "sample.txt"), "second\n");
    git(cwd, "add", "sample.txt");
    git(cwd, "commit", "-m", "Sample change");
    git(cwd, "push", "--set-upstream", "origin", "sample-change");
    const headSha = git(cwd, "rev-parse", "HEAD");
    git(forge.bare, "update-ref", "refs/merge-requests/7/head", headSha);
    git(cwd, "switch", "main");
    git(cwd, "branch", "--delete", "--force", "sample-change");
    await NodeFSP.writeFile(answer, JSON.stringify(mergeRequest(headSha)));

    peer = await startPeerServer({ environment: forge.environment });
    client = peer.client;
  });

  afterAll(async () => {
    await peer?.stop();
    await NodeFSP.rm(root, { recursive: true, force: true });
  });

  const expectedPullRequest = {
    number: 7,
    title: "Sample change",
    baseBranch: "main",
    headBranch: "sample-change",
    state: "open",
  };

  it("keeps an inherited URL rewrite from moving the remote off the stub", async () => {
    let requests = 0;
    const listener = NodeHttp.createServer((_request, response) => {
      requests += 1;
      response.statusCode = 404;
      response.end();
    });
    await new Promise<void>((resolve) => listener.listen(0, "127.0.0.1", resolve));
    const { port } = listener.address() as NodeNet.AddressInfo;
    const inherited = {
      ...process.env,
      GIT_CONFIG_COUNT: "1",
      GIT_CONFIG_KEY_0: `url.http://127.0.0.1:${port}/.insteadOf`,
      GIT_CONFIG_VALUE_0: "git@gitlab.invalid:",
    };
    const lsRemote = (env: NodeJS.ProcessEnv) =>
      execFile("git", ["-C", cwd, "ls-remote", "origin", "refs/heads/main"], {
        env: { ...env, GIT_SSH_COMMAND: sshCommand },
      });
    try {
      // The rewrite takes effect when it is inherited, so the listener proves the check.
      await lsRemote(inherited).catch(() => undefined);
      expect(requests).toBeGreaterThan(0);
      requests = 0;
      const { stdout } = await lsRemote({ ...inherited, ...isolatedGit });
      expect(stdout).toContain("refs/heads/main");
      expect(requests).toBe(0);
    } finally {
      await new Promise((resolve) => listener.close(resolve));
    }
  });

  it("resolves a pull request", async () => {
    const { pullRequest } = await client.rpc.call("git.resolvePullRequest", {
      cwd,
      reference: "7",
    });
    expect(pullRequest).toMatchObject(expectedPullRequest);
  });

  it("prepares a pull request in a new worktree", async () => {
    const prepared = await client.rpc.call("git.preparePullRequestThread", {
      cwd,
      reference: "7",
      mode: "worktree",
    });
    expect(prepared).toMatchObject({ pullRequest: expectedPullRequest, isOnPullRequestHead: true });
    expect(prepared.worktreePath).not.toBeNull();
    const worktree = prepared.worktreePath ?? "";
    expect(git(worktree, "rev-parse", "--abbrev-ref", "HEAD")).toBe(prepared.branch);
    git(cwd, "worktree", "remove", "--force", worktree);
    git(cwd, "branch", "--delete", "--force", prepared.branch);
  });

  it("prepares a pull request on the current checkout", async () => {
    const prepared = await client.rpc.call("git.preparePullRequestThread", {
      cwd,
      reference: "7",
      mode: "local",
    });
    expect(prepared).toMatchObject({
      pullRequest: expectedPullRequest,
      branch: "sample-change",
      worktreePath: null,
      isOnPullRequestHead: true,
    });
  });

  it("opens an existing pull request from a stacked action", async () => {
    await NodeFSP.writeFile(NodePath.join(cwd, "action.txt"), "action\n");
    const events: Exclude<
      schemas.git.GitActionProgressEvent,
      schemas.common.UnknownVariant<"kind">
    >[] = [];
    for await (const item of client.rpc.stream("git.runStackedAction", {
      actionId: NodeCrypto.randomUUID(),
      cwd,
      action: "commit_push_pr",
      commitMessage: "Add the action file",
      filePaths: ["action.txt"],
    })) {
      if (item.kind !== "item") throw item.error;
      if (schemas.common.isUnknownVariant<"kind">(item.value)) throw new Error("Unknown event.");
      events.push(item.value as (typeof events)[number]);
    }
    const finished = events.find((event) => event.kind === "action_finished");
    if (finished?.kind !== "action_finished") throw new Error("The action did not finish.");
    expect(finished.result).toMatchObject({
      commit: { status: "created" },
      push: { status: "pushed" },
      pr: { status: "opened_existing", number: 7 },
      toast: { cta: { kind: "open_pr" } },
    });
  });

  // The server asks the agent for the title and body of a new pull request.
  it.skipIf(!hasAgent)(
    "creates a pull request with text from a real agent",
    { timeout: 240_000 },
    async () => {
      await client.rpc.call("server.updateSettings", {
        patch: { textGenerationModelSelection: modelSelection },
      });
      git(cwd, "switch", "--create", "agent-change");
      await NodeFSP.writeFile(NodePath.join(cwd, "agent.txt"), "agent\n");
      let result: schemas.git.GitRunStackedActionResult | undefined;
      const stack = client.rpc.stream("git.runStackedAction", {
        actionId: NodeCrypto.randomUUID(),
        cwd,
        action: "commit_push",
        commitMessage: "Add the agent file",
        filePaths: ["agent.txt"],
      });
      for await (const item of stack) if (item.kind !== "item") throw item.error;
      const pr = client.rpc.stream("git.runStackedAction", {
        actionId: NodeCrypto.randomUUID(),
        cwd,
        action: "create_pr",
      });
      for await (const item of pr) {
        if (item.kind !== "item") throw item.error;
        const event = item.value;
        if (schemas.common.isUnknownVariant<"kind">(event)) continue;
        if (event.kind === "action_failed") throw new Error(event.message);
        if (event.kind === "phase_started" && event.label.startsWith("Creating")) {
          await NodeFSP.writeFile(
            created,
            JSON.stringify(mergeRequest(git(cwd, "rev-parse", "HEAD"), 8, "agent-change")),
          );
        }
        if (event.kind === "action_finished") result = event.result as typeof result;
      }
      expect(result?.pr).toMatchObject({ status: "created", number: 8 });
      expect(await NodeFSP.readFile(createCall, "utf8")).toContain("merge_requests");
    },
  );
});
