// ---
// relationships:
//   verifies: library-wire
// ---
/**
 * What 0.1.10 added that a fake server cannot show, on an isolated stock server: settings and
 * secret source reads, T3 Connect device approval, the shell snapshot's resume answer, the visit
 * event, linked-thread refreshes, exact file paths, ignored-file search, the space key and the
 * schedule zone.
 */
import * as NodeCP from "node:child_process";
import * as NodeFSP from "node:fs/promises";
import * as NodeOS from "node:os";
import * as NodePath from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vite-plus/test";
import { T3AuthError, type T3Client } from "../../src/index.ts";
import { isUnknownVariant, type ProjectId, type ThreadId } from "../../src/schemas/common.ts";
import {
  connect,
  connectWithScopes,
  firstItem,
  hasLiveServer,
  modelSelection,
} from "./liveClient.ts";

describe.skipIf(!hasLiveServer)("live 0.1.10 additions", () => {
  const client = connect();
  let projectId: ProjectId;
  let workspaceRoot: string;
  const created: ThreadId[] = [];
  const scoped: T3Client[] = [];
  const newThread = async (title: string) => {
    const thread = await client.threads.create({ projectId, title, modelSelection });
    created.push(thread.id);
    return thread.id;
  };

  beforeAll(async () => {
    const project = await client.projects.createNew({ name: "Sample additions" });
    projectId = project.projectId;
    workspaceRoot = project.workspaceRoot;
  });
  afterAll(async () => {
    for (const id of created) await client.threads.delete(id).catch(() => undefined);
    await client.projects.delete(projectId, { force: true }).catch(() => undefined);
    for (const other of scoped) await other.close();
    await client.close();
  });

  it("reads the settings and checks a secret source that cannot resolve", async () => {
    const settings = await client.rpc.call("server.getSettings", {});
    expect(settings).toMatchObject({
      keepAwakeWhileAgentsWork: expect.any(Boolean),
      requireConnectDeviceApproval: false,
      defaultAppearance: "",
    });
    const check = await client.rpc.call("server.checkSecretSource", {
      source: { provider: "sample-missing", reference: "sample/key" },
    });
    expect(check).toMatchObject({ _tag: "Failed", detail: expect.any(String) });
    const reader = await connectWithScopes(client, ["orchestration:read"]);
    scoped.push(reader);
    await expect(
      reader.rpc.call("server.checkSecretSource", {
        source: { provider: "sample-missing", reference: "sample/key" },
      }),
    ).rejects.toBeInstanceOf(T3AuthError);
  });

  it("answers the device routes and guards device approval with access:write", async () => {
    await expect(
      client.routes.call("auth.approveConnectDevice", {
        body: { pairingLinkId: "sample-missing" },
      }),
    ).resolves.toEqual({ approved: false });
    await expect(
      client.routes.call("auth.revokeConnectDevice", {
        body: { proofKeyThumbprint: "sample-missing" },
      }),
    ).resolves.toEqual({ revoked: false });
    const access = await firstItem(client.rpc.stream("subscribeAuthAccess", {}), (event) =>
      !isUnknownVariant<"type">(event) && event.type === "snapshot" ? event.payload : undefined,
    );
    expect(access.connectDevices).toEqual([]);

    const settingsWriter = await connectWithScopes(client, [
      "orchestration:read",
      "settings:write",
    ]);
    const accessWriter = await connectWithScopes(client, ["orchestration:read", "access:write"]);
    scoped.push(settingsWriter, accessWriter);
    const patch = { requireConnectDeviceApproval: true };
    await expect(
      settingsWriter.rpc.call("server.updateSettings", { patch }),
    ).rejects.toBeInstanceOf(T3AuthError);
    expect(
      await settingsWriter.rpc.callRaw("server.updateSettings", { patch }).catch((e: unknown) => e),
    ).toMatchObject({ tag: "EnvironmentAuthorizationError" });
    try {
      const updated = await accessWriter.rpc.call("server.updateSettings", { patch });
      expect(updated.requireConnectDeviceApproval).toBe(true);
    } finally {
      await accessWriter.rpc.call("server.updateSettings", {
        patch: { requireConnectDeviceApproval: false },
      });
    }
  });

  it("answers a shell cursor at the head with resumable, and one ahead of it with a snapshot", async () => {
    const snapshot = await client.routes.call("orchestration.shellSnapshot", {});
    expect(snapshot.projectIdentities).toEqual(expect.any(String));
    const atHead = await client.routes.call("orchestration.shellSnapshotResume", {
      query: { resumeFrom: String(snapshot.snapshotSequence) },
    });
    expect(atHead).toEqual({ resumable: true });
    const ahead = await client.routes.call("orchestration.shellSnapshotResume", {
      query: { resumeFrom: snapshot.snapshotSequence + 5_000 },
    });
    expect(ahead).toMatchObject({ projectIdentities: snapshot.projectIdentities });
  });

  it("sends a visit as thread.visit-recorded, which changes only the read state", async () => {
    const id = await newThread("Sample visit");
    const visitedAt = new Date(Date.now() + 60_000).toISOString();
    const controller = new AbortController();
    const visit = (async () => {
      for await (const item of client.threads.watch(id, { signal: controller.signal })) {
        if (item.kind === "decode-error") throw item.error;
        if (item.kind === "snapshot") {
          await client.threads.dispatch({
            type: "thread.visit",
            commandId: client.threads.dispatcher.newCommandId(),
            threadId: id,
            visitedAt,
          });
        }
        if (item.kind !== "event" || isUnknownVariant<"type">(item.event)) continue;
        if (item.event.type === "thread.visit-recorded") return item.event;
      }
      throw new Error("The watch ended without thread.visit-recorded.");
    })();
    const event = await visit.finally(() => controller.abort());
    expect(new Date(event.payload.lastVisitedAt ?? 0).toISOString()).toBe(visitedAt);
    expect(event.payload).not.toHaveProperty("title");
    const thread = (await client.threads.projection(id)).thread;
    expect(new Date(thread.lastVisitedAt ?? 0).toISOString()).toBe(visitedAt);
  });

  it("publishes a linked-thread refresh when a thread links a pull request", async () => {
    const id = await newThread("Sample linked thread");
    const controller = new AbortController();
    const revision = firstItem(
      client.rpc.stream(
        "pullRequests.subscribeLinkedThreadRefreshes",
        {},
        {
          signal: controller.signal,
        },
      ),
      (value) => value,
    );
    await new Promise((resolve) => setTimeout(resolve, 500));
    await client.threads.dispatch({
      type: "thread.pull-request.link",
      commandId: client.threads.dispatcher.newCommandId(),
      threadId: id,
      host: "example.invalid",
      repository: "sample/repository",
      number: 7,
      url: "https://example.invalid/sample/repository/pull/7",
      source: "manual",
    });
    try {
      expect(await revision).toBeGreaterThan(0);
    } finally {
      controller.abort();
    }
  });

  it("keeps a file path that starts with a space exactly", async () => {
    const relativePath = " sample notes.md";
    const written = await client.rpc.call("projects.writeFile", {
      cwd: workspaceRoot,
      relativePath,
      contents: "Sample\n",
    });
    expect(written.relativePath).toBe(relativePath);
    const read = await client.rpc.call("projects.readFile", { cwd: workspaceRoot, relativePath });
    expect(read).toMatchObject({ relativePath, contents: "Sample\n" });
  });

  it("searches ignored files by path", async () => {
    const repo = await NodeFSP.mkdtemp(NodePath.join(NodeOS.tmpdir(), "t3code-ignored-search-"));
    try {
      NodeCP.execFileSync("git", ["init", "--initial-branch=main", repo], { stdio: "pipe" });
      await NodeFSP.writeFile(NodePath.join(repo, ".gitignore"), "*.env\n*.log\n");
      await NodeFSP.writeFile(NodePath.join(repo, "sample.env"), "SAMPLE=1\n");
      await NodeFSP.writeFile(NodePath.join(repo, "build.log"), "log\n");
      const listed = await client.rpc.call("projects.listIgnoredFiles", {
        cwd: repo,
        query: "ENV",
      });
      expect(listed.files.map((file) => file.path)).toEqual(["sample.env"]);
    } finally {
      await NodeFSP.rm(repo, { recursive: true, force: true });
    }
  });

  it("resolves the space key of a keybinding", async () => {
    const rule = { key: "mod+shift+space", command: "usage.open" } as const;
    const added = await client.rpc.call("server.upsertKeybinding", rule);
    try {
      expect(
        added.keybindings
          .filter((entry) => entry.command === "usage.open")
          .map((e) => e.shortcut.key),
      ).toContain(" ");
    } finally {
      await client.rpc.call("server.removeKeybinding", rule);
    }
  });

  it("names the zone of fixed-time schedules and omits providers from a refresh on request", async () => {
    const controller = new AbortController();
    const tasks = await firstItem(
      client.rpc.stream("scheduledTasks.subscribe", {}, { signal: controller.signal }),
      (value) => value,
    ).finally(() => controller.abort());
    expect(tasks.timeZone).toEqual(expect.any(String));
    const refreshed = await client.rpc.call("server.refreshProviders", { omitProviders: true });
    expect(refreshed.providers).toEqual([]);
  });
});
