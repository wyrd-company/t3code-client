// ---
// relationships:
//   verifies: library-wire
// ---
/**
 * The tracked clone methods on an owned stock server. A local bare repository is
 * the remote. A wrapper of the forge's `ssh` script holds a clone open for the
 * cancel tests.
 */
import * as NodeFS from "node:fs";
import * as NodeFSP from "node:fs/promises";
import * as NodePath from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vite-plus/test";
import type { T3Client } from "../../src/index.ts";
import { ProjectId } from "../../src/schemas/common.ts";
import type { ProjectCloneSnapshot } from "../../src/schemas/projectClone.ts";
import { firstItem, hasLiveServer, refusal } from "./liveClient.ts";
import {
  createLocalForge,
  gitLabProjectCases,
  initBareRepository,
  type LocalForge,
} from "./localForge.ts";
import { startScratchServer, withScopes, type PeerServer } from "./peerServer.ts";

const projectId = (name: string) => ProjectId.parse(`sample-clone-${name}`);
const remote = (name: string) => `git@gitlab.invalid:sample/${name}.git`;

describe.skipIf(!hasLiveServer)("project clone methods with a local forge stub", () => {
  let root: string;
  let forge: LocalForge;
  let peer: PeerServer;
  let client: T3Client;

  const destination = (name: string) => NodePath.join(root, "clones", name);

  const start = (
    name: string,
    source: { remoteUrl?: string; provider?: string; repository?: string; protocol?: "ssh" },
  ) =>
    client.rpc.call("projectClone.start", {
      projectId: projectId(name),
      title: name,
      createdAt: new Date().toISOString(),
      destinationPath: destination(name),
      ...source,
    });

  /** The clone's snapshot, once `accept` keeps it. The stream starts with the current list. */
  const snapshot = (name: string, accept: (clone: ProjectCloneSnapshot) => boolean) =>
    firstItem(client.rpc.stream("subscribeProjectClones", {}), (clones) =>
      clones.find((clone) => clone.projectId === projectId(name) && accept(clone)),
    );
  const inPhase = (name: string, phase: string) => snapshot(name, (clone) => clone.phase === phase);

  beforeAll(async () => {
    peer = await startScratchServer("t3code-lib-project-clone-", async (home) => {
      root = home;
      forge = await createLocalForge(
        root,
        gitLabProjectCases(root, NodePath.join(root, "create-calls.log")),
      );
      const holdingSsh = NodePath.join(root, "bin", "ssh-holding");
      await NodeFSP.writeFile(
        holdingSsh,
        `#!/bin/sh\nfor last; do :; done\ncase "$last" in *holding*) exec sleep 30 ;; esac\nexec '${forge.sshCommand}' "$@"\n`,
        { mode: 0o755 },
      );
      return { ...forge.environment, GIT_SSH_COMMAND: holdingSsh };
    });
    client = peer.client;
  });

  afterAll(() => peer?.stop());

  it("creates the project at once, then reports the clone to its end", async () => {
    const started = await start("named", {
      provider: "gitlab",
      repository: "sample/repository",
      protocol: "ssh",
    });
    expect(started).toEqual({
      projectId: projectId("named"),
      cwd: destination("named"),
      remoteUrl: remote("repository"),
      repository: expect.objectContaining({ nameWithOwner: "sample/repository" }),
    });
    const { projects } = await client.shell.snapshot();
    expect(projects.map((project) => project.id)).toContain(projectId("named"));

    const done = await inPhase("named", "done");
    expect(done).toMatchObject({
      destinationPath: destination("named"),
      error: null,
      repository: { nameWithOwner: "sample/repository" },
    });
    expect(done.endedAt).not.toBeNull();
    expect(NodeFS.existsSync(NodePath.join(destination("named"), "sample.txt"))).toBe(true);
  });

  it("applies neither action to a finished clone or an absent project", async () => {
    await start("finished", { remoteUrl: remote("repository") });
    await inPhase("finished", "done");
    for (const id of [projectId("finished"), projectId("absent")]) {
      for (const method of ["projectClone.cancel", "projectClone.retry"] as const) {
        await expect(client.rpc.call(method, { projectId: id })).resolves.toEqual({
          applied: false,
        });
      }
    }
  });

  it("retries a failed clone", async () => {
    await start("later", { remoteUrl: remote("later") });
    const failed = await inPhase("later", "failed");
    expect(failed.error).toEqual(expect.any(String));

    const bare = NodePath.join(root, "sample", "later.git");
    initBareRepository(bare);
    forge.git(forge.cwd, "push", remote("later"), "main");
    await expect(
      client.rpc.call("projectClone.retry", { projectId: projectId("later") }),
    ).resolves.toEqual({ applied: true });
    await expect(inPhase("later", "done")).resolves.toMatchObject({ error: null });
    expect(NodeFS.existsSync(NodePath.join(destination("later"), "sample.txt"))).toBe(true);
  });

  it("cancels a running clone, retries it, and refuses a second clone of its project", async () => {
    await start("holding", { remoteUrl: remote("holding") });
    await inPhase("holding", "running");

    expect(await refusal(start("holding", { remoteUrl: remote("repository") }))).toMatchObject({
      _tag: "SourceControlRepositoryError",
      operation: "cloneRepository",
    });

    const cancel = () =>
      client.rpc.call("projectClone.cancel", { projectId: projectId("holding") });
    await expect(cancel()).resolves.toEqual({ applied: true });
    await inPhase("holding", "cancelled");

    await expect(
      client.rpc.call("projectClone.retry", { projectId: projectId("holding") }),
    ).resolves.toEqual({ applied: true });
    await inPhase("holding", "running");
    await expect(cancel()).resolves.toEqual({ applied: true });
    await inPhase("holding", "cancelled");
  });

  it("keeps a URL's credential out of the clone's reports", async () => {
    const started = await start("with-password", {
      remoteUrl: "https://sample:sample-password@gitlab.invalid/sample/repository.git",
    });
    expect(started.remoteUrl).toBe("https://gitlab.invalid/sample/repository.git");
    const failed = await inPhase("with-password", "failed");
    expect(JSON.stringify(failed)).not.toContain("sample-password");
  });

  it("holds each method to its scope", async () => {
    await withScopes(peer, ["orchestration:read"], async (reader) => {
      await expect(
        firstItem(reader.rpc.stream("subscribeProjectClones", {}), (clones) => clones),
      ).resolves.toEqual(expect.any(Array));
      await expect(
        reader.rpc.call("projectClone.cancel", { projectId: projectId("absent") }),
      ).rejects.toMatchObject({ requiredScope: "source-control:write" });
    });
  });
});
