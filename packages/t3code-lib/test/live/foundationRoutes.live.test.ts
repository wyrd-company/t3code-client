// ---
// relationships:
//   verifies: library-wire
// ---
/** The project mutation and bounded snapshot routes on a real stock server. */
import * as NodeFSP from "node:fs/promises";
import * as NodeOS from "node:os";
import * as NodePath from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vite-plus/test";
import {
  T3Client,
  T3NotFoundError,
  commandId,
  memoryCredentialStore,
  projectId,
  schemas,
  threadId,
} from "../../src/index.ts";
import { connect, hasLiveServer, modelSelection } from "./liveClient.ts";

describe.skipIf(!hasLiveServer)("foundation routes", () => {
  const client = connect();
  let workspace: string;
  const id = projectId(`project-${crypto.randomUUID()}`);

  beforeAll(async () => {
    workspace = await NodeFSP.mkdtemp(NodePath.join(NodeOS.tmpdir(), "t3code-lib-routes-"));
  });

  afterAll(async () => {
    await client.close();
    await NodeFSP.rm(workspace, { recursive: true, force: true });
  });

  it("creates and updates a project over HTTP", async () => {
    const created = await client.routes.call("projects.mutate", {
      body: {
        type: "project.create",
        commandId: commandId(`command-${crypto.randomUUID()}`),
        projectId: id,
        title: "Sample project",
        workspaceRoot: workspace,
      },
    });
    expect(created).toMatchObject({ id, title: "Sample project" });

    const updated = await client.routes.call("projects.mutate", {
      body: {
        type: "project.update",
        commandId: commandId(`command-${crypto.randomUUID()}`),
        projectId: id,
        title: "Renamed project",
      },
    });
    expect(updated.title).toBe("Renamed project");
    const { projects } = await client.routes.call("projects.snapshot");
    expect(projects.map((project) => project.id)).toContain(id);
  });

  it("reads a bounded snapshot, compact or not, and restores the turn items", async () => {
    const thread = await client.threads.create({
      projectId: id,
      title: "Sample thread",
      modelSelection,
    });
    const params = { threadId: thread.id };
    const whole = await client.routes.call("orchestration.threadBoundedSnapshot", { params });
    expect(whole.projection.thread.id).toBe(thread.id);
    expect(whole.turnItemsOmitLocalVisible).toBeUndefined();

    const compact = await client.routes.call("orchestration.threadBoundedSnapshot", {
      params,
      query: { deferWork: "1", compactTurnItems: "1", dedupeBodies: "1" },
    });
    const restored = schemas.orchestrationBoundedSnapshot.boundedSnapshotProjection(compact);
    expect(restored.turnItems.length).toBe(whole.projection.turnItems.length);

    await expect(
      client.routes.call("orchestration.threadBoundedSnapshot", {
        params: { threadId: threadId(`thread-${crypto.randomUUID()}`) },
      }),
    ).rejects.toBeInstanceOf(T3NotFoundError);
    await client.threads.delete(thread.id);
  });

  it("needs the settings grant for a mutation that carries scripts", async () => {
    const { credential } = await client.auth.createPairingCredential({
      label: "live route test",
      scopes: ["orchestration:read", "orchestration:operate"],
    });
    const narrow = T3Client.create({
      baseUrl: process.env["T3_LIVE_URL"] ?? "",
      credentials: memoryCredentialStore(),
    });
    await narrow.auth.exchangePairingToken(credential);
    const body = {
      type: "project.update" as const,
      commandId: commandId(`command-${crypto.randomUUID()}`),
      projectId: id,
      scripts: [],
    };
    await expect(narrow.routes.call("projects.mutate", { body })).rejects.toMatchObject({
      code: "insufficient_scope",
      requiredScope: "settings:write",
    });
    // The server enforces the same rule without the local check.
    const direct = await fetch(new URL("/api/projects/mutate", process.env["T3_LIVE_URL"]), {
      method: "POST",
      headers: {
        authorization: `Bearer ${await narrow.auth.currentAccessToken()}`,
        "content-type": "application/json",
      },
      body: JSON.stringify(body),
    });
    expect(direct.status).toBe(403);
    await narrow.close();
  });

  it("deletes the project over HTTP", async () => {
    await client.routes.call("projects.mutate", {
      body: {
        type: "project.delete",
        commandId: commandId(`command-${crypto.randomUUID()}`),
        projectId: id,
      },
    });
    const { projects } = await client.routes.call("projects.snapshot");
    expect(
      projects.find((project) => project.id === id && project.deletedAt === null),
    ).toBeUndefined();
  });
});
