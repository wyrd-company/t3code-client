// ---
// relationships:
//   verifies: library-wire
// ---
/**
 * What 0.1.12 added that a fake server cannot show, on an isolated stock server: the probe's
 * time, the session's own id, the feedback and workflow settings, tracked project folders and
 * the folder scan, task folder and layout command reads, a branch name with Unicode whitespace,
 * and the refs digest of a status refresh.
 */
import * as NodeCP from "node:child_process";
import * as NodeFSP from "node:fs/promises";
import * as NodeOS from "node:os";
import * as NodePath from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vite-plus/test";
import { T3AuthError, type T3Client } from "../../src/index.ts";
import type { ProjectId } from "../../src/schemas/common.ts";
import { connect, connectWithScopes, hasLiveServer } from "./liveClient.ts";

const identity = ["-c", "user.name=Sample", "-c", "user.email=sample@example.invalid"];
const git = (cwd: string, ...args: string[]) =>
  NodeCP.execFileSync("git", ["-C", cwd, ...identity, ...args], { encoding: "utf8" }).trim();

/** A repository at `path` with one commit. */
async function repository(path: string): Promise<void> {
  await NodeFSP.mkdir(path, { recursive: true });
  git(path, "init", "--initial-branch=main");
  await NodeFSP.writeFile(NodePath.join(path, "sample.txt"), "sample\n");
  git(path, "add", "sample.txt");
  git(path, "commit", "-m", "Initial");
}

describe.skipIf(!hasLiveServer)("live 0.1.12 additions", () => {
  const client = connect();
  const scoped: T3Client[] = [];
  let root: string;
  let projectId: ProjectId | undefined;

  beforeAll(async () => {
    root = await NodeFSP.realpath(
      await NodeFSP.mkdtemp(NodePath.join(NodeOS.tmpdir(), "t3code-0112-")),
    );
  });
  afterAll(async () => {
    if (projectId) await client.projects.delete(projectId, { force: true }).catch(() => undefined);
    for (const other of scoped) await other.close();
    await client.close();
    await NodeFSP.rm(root, { recursive: true, force: true });
  });

  it("answers the probe with the host's time and the session with its own id", async () => {
    const before = Date.now();
    const probe = await client.rpc.call("server.probe", {});
    expect(typeof probe.serverTime).toBe("string");
    expect(Math.abs(Date.parse(probe.serverTime ?? "") - before)).toBeLessThan(60_000);
    const state = await client.auth.sessionState();
    expect(state.sessionId).toEqual(expect.any(String));
  });

  it("reads and patches the agent feedback and workflow settings", async () => {
    const before = await client.rpc.call("server.getSettings", {});
    expect(before).toMatchObject({
      agentFeedback: { mode: "off" },
      workflowsEnabled: false,
      workflowSkippedRunsKept: 500,
    });
    try {
      await client.rpc.call("server.updateSettings", {
        patch: { agentFeedback: { mode: "on-request" }, workflowSkippedRunsKept: 25 },
      });
      expect(await client.rpc.call("server.getSettings", {})).toMatchObject({
        agentFeedback: { mode: "on-request" },
        workflowSkippedRunsKept: 25,
      });
    } finally {
      await client.rpc.call("server.updateSettings", {
        patch: { agentFeedback: { mode: "off" }, workflowSkippedRunsKept: 500 },
      });
    }
  });

  it("scans a folder, tracks added folders on a project, and lists both kinds", async () => {
    const home = NodePath.join(root, "sample-project");
    const added = NodePath.join(root, "sample-docs");
    await repository(home);
    await repository(NodePath.join(home, "packages", "lib"));
    await repository(NodePath.join(root, "sample-app"));
    await NodeFSP.mkdir(added);
    const scan = await client.rpc.call("workspace.scanFolders", { workspaceRoot: root });
    expect(scan.workspaceRoot).toBe(root);
    expect(scan.isGitRepository).toBe(false);
    // A scan offers the repositories one level down; a plain folder is added by path.
    expect(scan.folders.map((folder) => folder.name).sort()).toEqual([
      "sample-app",
      "sample-project",
    ]);
    expect(scan.folders[0]).toMatchObject({ isGitRepository: true, source: "child" });
    const project = await client.projects.create({
      title: "Sample tracked folders",
      workspaceRoot: home,
      trackedFolders: [{ path: added, name: "sample-docs" }],
    });
    projectId = project.id;
    expect(project.trackedFolders).toEqual(
      expect.arrayContaining([expect.objectContaining({ path: added, name: "sample-docs" })]),
    );
    const listed = await client.rpc.call("workspace.listFolders", { projectId });
    expect(listed.folders).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ path: added, state: "plain" }),
        expect.objectContaining({ name: "lib", state: "git", discovered: true }),
      ]),
    );
    const app = NodePath.join(root, "sample-app");
    const updated = await client.projects.update(projectId, {
      trackFolders: [{ path: app, name: "sample-app" }],
      untrackFolders: [added],
    });
    const paths = (updated.trackedFolders ?? []).map((folder) => folder.path);
    expect(paths).toContain(app);
    expect(paths).not.toContain(added);
    const shell = (await client.shell.snapshot()).projects.find((entry) => entry.id === projectId);
    expect(shell?.trackedFolders?.map((folder) => folder.path)).toEqual(paths);
  });

  it("reads no task folder for a plain checkout and no layout commands without t3.json", async () => {
    if (!projectId) throw new Error("The tracked folders test creates the project.");
    const home = NodePath.join(root, "sample-project");
    expect(await client.rpc.call("workspace.taskFolder", { worktreePath: home })).toEqual({
      taskFolder: null,
    });
    expect(await client.rpc.call("workspace.layoutCommands", { projectId })).toEqual({
      commands: [],
    });
    expect(
      await client.rpc.call("workspace.approveLayoutCommands", { projectId, approvals: [] }),
    ).toEqual({ commands: [] });
    const reader = await connectWithScopes(client, ["orchestration:read", "filesystem:read"]);
    scoped.push(reader);
    await expect(
      reader.rpc.call("workspace.approveLayoutCommands", { projectId, approvals: [] }),
    ).rejects.toBeInstanceOf(T3AuthError);
  });

  it("creates and lists a branch whose name ends in a no-break space", async () => {
    const repo = NodePath.join(root, "sample-refs");
    await repository(repo);
    const refName = "sample-topic\u00a0";
    const created = await client.rpc.call("vcs.createRef", { cwd: repo, refName: ` ${refName}\n` });
    expect(created.refName).toBe(refName);
    // `git` trims nothing here: String.prototype.trim would strip the no-break space too.
    const onDisk = NodeCP.execFileSync(
      "git",
      ["-C", repo, "for-each-ref", "--format=%(refname:short)", "refs/heads/sample-topic*"],
      { encoding: "utf8" },
    );
    expect(onDisk).toBe(`${refName}\n`);
    const refs = await client.rpc.call("vcs.listRefs", { cwd: repo, refKind: "local" });
    expect(refs.refs.map((ref) => ref.name)).toContain(refName);
    const status = await client.rpc.call("vcs.refreshStatus", { cwd: repo });
    expect(status.refsDigest).toEqual(expect.any(String));
  });
});
