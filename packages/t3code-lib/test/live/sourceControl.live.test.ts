// ---
// relationships:
//   verifies: library-wire
// ---
/**
 * The source control repository and sign-in methods on an owned stock server with
 * its own `HOME`. A local `glab` stub and a local bare repository play the forge.
 * The GitHub driver's calls name a host under `.invalid`, so no call reaches a forge.
 * No test finishes a sign-in, since that needs a forge's device flow.
 */
import * as NodeFS from "node:fs";
import * as NodeFSP from "node:fs/promises";
import * as NodeOS from "node:os";
import * as NodePath from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vite-plus/test";
import type { T3Client } from "../../src/index.ts";
import { connectWithScopes, hasLiveServer, refusal } from "./liveClient.ts";
import { createLocalForge, gitLabProjectCases, type LocalForge } from "./localForge.ts";
import { startPeerServer, type PeerServer } from "./peerServer.ts";

const provider = "gitlab";
const noDriver = { provider: "example-forge", host: "forge.example.invalid" };
const github = { provider: "github", host: "github.invalid" };
const repository = "sample/repository";

describe.skipIf(!hasLiveServer)("source control methods with a local forge stub", () => {
  let root: string;
  let createCalls: string;
  let forge: LocalForge;
  let peer: PeerServer;
  let client: T3Client;

  const destination = (name: string) => NodePath.join(root, "clones", name);

  beforeAll(async () => {
    root = await NodeFSP.mkdtemp(NodePath.join(NodeOS.tmpdir(), "t3code-lib-source-control-"));
    createCalls = NodePath.join(root, "create-calls.log");
    forge = await createLocalForge(root, gitLabProjectCases(root, createCalls));
    peer = await startPeerServer({
      environment: {
        ...forge.environment,
        HOME: root,
        CODEX_HOME: NodePath.join(root, ".codex"),
        T3CODE_GITHUB_APP_CLIENT_ID: "",
      },
    });
    client = peer.client;
  });

  afterAll(async () => {
    await peer?.stop();
    if (root) await NodeFSP.rm(root, { recursive: true, force: true });
  });

  it("looks up a repository, and refuses one that the forge does not have", async () => {
    await expect(
      client.rpc.call("sourceControl.lookupRepository", { provider, repository }),
    ).resolves.toEqual({
      provider,
      nameWithOwner: repository,
      url: "https://gitlab.invalid/sample/repository",
      sshUrl: "git@gitlab.invalid:sample/repository.git",
    });
    expect(
      await refusal(
        client.rpc.call("sourceControl.lookupRepository", {
          provider,
          repository: "sample/absent",
        }),
      ),
    ).toMatchObject({
      _tag: "SourceControlRepositoryError",
      provider,
      operation: "lookupRepository",
    });
  });

  it("clones a repository by name and by URL", async () => {
    const byName = await client.rpc.call("sourceControl.cloneRepository", {
      provider,
      repository,
      destinationPath: destination("by-name"),
      protocol: "ssh",
    });
    expect(byName).toEqual({
      cwd: destination("by-name"),
      remoteUrl: "git@gitlab.invalid:sample/repository.git",
      repository: expect.objectContaining({ nameWithOwner: repository }),
    });
    expect(NodeFS.existsSync(NodePath.join(byName.cwd, "sample.txt"))).toBe(true);

    const byUrl = await client.rpc.call("sourceControl.cloneRepository", {
      remoteUrl: "git@gitlab.invalid:sample/repository.git",
      destinationPath: destination("by-url"),
    });
    expect(byUrl.repository).toBeNull();
    expect(NodeFS.existsSync(NodePath.join(byUrl.cwd, "sample.txt"))).toBe(true);
  });

  it("refuses a clone into a used folder, or with no source", async () => {
    expect(
      await refusal(
        client.rpc.call("sourceControl.cloneRepository", {
          remoteUrl: "git@gitlab.invalid:sample/repository.git",
          destinationPath: forge.cwd,
        }),
      ),
    ).toMatchObject({ _tag: "SourceControlRepositoryError", operation: "cloneRepository" });
    expect(
      await refusal(
        client.rpc.call("sourceControl.cloneRepository", {
          destinationPath: destination("no-source"),
        }),
      ),
    ).toMatchObject({ _tag: "SourceControlRepositoryError", operation: "cloneRepository" });
  });

  it("keeps a URL's credential out of a failed clone", async () => {
    const record = await refusal(
      client.rpc.call("sourceControl.cloneRepository", {
        remoteUrl: "https://sample:sample-password@gitlab.invalid/sample/repository.git",
        destinationPath: destination("with-password"),
      }),
    );
    expect(record).toMatchObject({ _tag: "SourceControlRepositoryError" });
    expect(JSON.stringify(record)).not.toContain("sample-password");
  });

  it("publishes a repository with commits", async () => {
    const cwd = NodePath.join(root, "to-publish");
    await NodeFSP.mkdir(cwd);
    forge.git(cwd, "init", "--initial-branch=main");
    await NodeFSP.writeFile(NodePath.join(cwd, "sample.txt"), "first\n");
    forge.git(cwd, "add", "sample.txt");
    forge.git(cwd, "commit", "-m", "Initial");
    const result = await client.rpc.call("sourceControl.publishRepository", {
      cwd,
      provider,
      repository: "sample/published",
      visibility: "private",
      remoteName: "forge",
      protocol: "ssh",
    });
    expect(result).toEqual({
      repository: expect.objectContaining({ nameWithOwner: "sample/published" }),
      remoteName: "forge",
      remoteUrl: "git@gitlab.invalid:sample/published.git",
      branch: "main",
      status: "pushed",
    });
    expect(NodeFS.readFileSync(createCalls, "utf8")).toContain("visibility=private");
    expect(forge.git(NodePath.join(root, "sample/published.git"), "rev-parse", "main")).toBe(
      forge.git(cwd, "rev-parse", "main"),
    );
  });

  it("publishes an empty repository as a remote only", async () => {
    const cwd = NodePath.join(root, "to-publish-empty");
    await NodeFSP.mkdir(cwd);
    forge.git(cwd, "init", "--initial-branch=main");
    await expect(
      client.rpc.call("sourceControl.publishRepository", {
        cwd,
        provider,
        repository: "sample/published-empty",
        visibility: "public",
      }),
    ).resolves.toMatchObject({ remoteName: "origin", status: "remote_added" });
    expect(forge.git(cwd, "remote", "get-url", "origin")).toBe(
      "git@gitlab.invalid:sample/published-empty.git",
    );
  });

  it("reads repository access with no forge sign-in", async () => {
    for (const forgeHost of [noDriver, github]) {
      const access = { ...forgeHost, repository };
      await expect(client.rpc.call("sourceControl.appAccess", access)).resolves.toEqual({
        status: "signed-out",
      });
      await expect(client.rpc.call("sourceControl.starred", access)).resolves.toBe(false);
    }
  });

  it.each(["signInStart", "signInWait", "signInCancel"] as const)(
    "refuses %s for a provider with no driver",
    async (method) => {
      expect(await refusal(client.rpc.call(`sourceControl.${method}`, noDriver))).toMatchObject({
        _tag: "SourceControlSignInError",
        ...noDriver,
        reason: "unsupported",
      });
    },
  );

  it("refuses a GitHub sign-in on a server with no app, and has nothing to wait for", async () => {
    expect(await refusal(client.rpc.call("sourceControl.signInStart", github))).toMatchObject({
      _tag: "SourceControlSignInError",
      reason: "unsupported",
    });
    expect(await refusal(client.rpc.call("sourceControl.signInWait", github))).toMatchObject({
      _tag: "SourceControlSignInError",
      reason: "not-started",
    });
    await expect(client.rpc.call("sourceControl.signInCancel", github)).resolves.toBeUndefined();
  });

  it("holds each method to its scope", async () => {
    const reader = await connectWithScopes(client, ["orchestration:read"], peer.baseUrl);
    try {
      await expect(
        reader.rpc.call("sourceControl.lookupRepository", { provider, repository }),
      ).resolves.toMatchObject({ nameWithOwner: repository });
      await expect(reader.rpc.call("sourceControl.signInCancel", github)).rejects.toMatchObject({
        requiredScope: "settings:write",
      });
      await expect(
        reader.rpc.call("sourceControl.cloneRepository", {
          remoteUrl: "git@gitlab.invalid:sample/repository.git",
          destinationPath: destination("refused"),
        }),
      ).rejects.toMatchObject({ requiredScope: "source-control:write" });
      expect(NodeFS.existsSync(destination("refused"))).toBe(false);
    } finally {
      await reader.close();
    }
  });
});
