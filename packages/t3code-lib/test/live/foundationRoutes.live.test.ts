// ---
// relationships:
//   verifies: library-wire
// ---
/** The project mutation and bounded snapshot routes on a real stock server. */
import * as NodeFSP from "node:fs/promises";
import * as NodeOS from "node:os";
import * as NodePath from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vite-plus/test";
import { T3NotFoundError, commandId, projectId, schemas, threadId } from "../../src/index.ts";
import {
  connect,
  connectWithScopes,
  hasAgent,
  hasLiveServer,
  modelSelection,
} from "./liveClient.ts";

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
      query: { deferWork: "1", compactTurnItems: "1" },
    });
    const restored = schemas.orchestrationBoundedSnapshot.boundedSnapshotProjection(compact);
    expect(restored.turnItems).toEqual(whole.projection.turnItems);

    await expect(
      client.routes.call("orchestration.threadBoundedSnapshot", {
        params: { threadId: threadId(`thread-${crypto.randomUUID()}`) },
      }),
    ).rejects.toBeInstanceOf(T3NotFoundError);
    await client.threads.delete(thread.id);
  });

  it.skipIf(!hasAgent)("restores a populated compact snapshot to the whole list", async () => {
    const thread = await client.threads.create({
      projectId: id,
      title: "Sample agent thread",
      modelSelection,
    });
    const turn = await client.threads.startTurn({
      threadId: thread.id,
      text: "Reply with one short sentence.",
    });
    await turn.completion;
    const params = { threadId: thread.id };
    const whole = await client.routes.call("orchestration.threadBoundedSnapshot", { params });
    const compact = await client.routes.call("orchestration.threadBoundedSnapshot", {
      params,
      query: { compactTurnItems: "1" },
    });
    expect(whole.projection.turnItems.length).toBeGreaterThan(0);
    expect(compact.turnItemsOmitLocalVisible).toBe(true);
    expect(compact.projection.turnItems.length).toBeLessThan(whole.projection.turnItems.length);
    expect(
      schemas.orchestrationBoundedSnapshot.boundedSnapshotProjection(compact).turnItems,
    ).toEqual(whole.projection.turnItems);
    await client.threads.delete(thread.id);
  });

  it("needs the settings grant for a mutation that carries scripts", async () => {
    const narrow = await connectWithScopes(client, ["orchestration:read", "orchestration:operate"]);
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
