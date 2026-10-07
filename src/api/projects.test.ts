import { afterEach, beforeEach, describe, expect, it } from "vite-plus/test";
import { FakeT3Server } from "../../test/support/fakeServer.ts";
import { at, makeShellProject, makeShellSnapshot } from "../../test/support/threadFixtures.ts";
import { RpcClient } from "../rpc/client.ts";
import { rpcMethods } from "../rpc/registry.ts";
import { projectId } from "../schemas/common.ts";
import type { OrchestrationProjectShell } from "../schemas/orchestration/shell.ts";
import { HttpTransport } from "../transport/http.ts";
import { RpcConnection } from "../transport/rpcConnection.ts";
import { SocketTransport } from "../transport/socket.ts";
import { CommandDispatcher } from "./dispatch.ts";
import { ProjectsApi, normalizeWorkspaceRoot } from "./projects.ts";

/** A full project record, as `projects.mutate` and `GET /api/projects` return it. */
const projectRecord = (overrides: Record<string, unknown> = {}) => ({
  ...makeShellProject(overrides),
  deletedAt: null,
});

describe("ProjectsApi", () => {
  let server: FakeT3Server;
  let connection: RpcConnection;
  let projects: ProjectsApi;
  let shellProjects: OrchestrationProjectShell[];
  let mutations: Record<string, unknown>[];

  beforeEach(async () => {
    server = await FakeT3Server.start();
    shellProjects = [makeShellProject({ workspaceRoot: "/srv/sample/" })];
    mutations = [];
    connection = new RpcConnection(new SocketTransport({ url: async () => server.wsUrl }));
    const rpc = new RpcClient(connection, rpcMethods);
    const http = new HttpTransport({
      baseUrl: server.httpUrl,
      fetch: server.fetch,
      getAccessToken: async () => "token-1",
    });
    projects = new ProjectsApi(http, rpc, new CommandDispatcher(rpc));
    server.routes.route("GET /api/orchestration/shell", () => ({
      status: 200,
      body: makeShellSnapshot({ projects: shellProjects }),
    }));
    server.handle("projects.mutate", (payload) => {
      const mutation = payload as Record<string, unknown>;
      mutations.push(mutation);
      if (mutation["type"] === "project.create") {
        const created = makeShellProject({
          id: mutation["projectId"],
          title: mutation["title"],
          workspaceRoot: mutation["workspaceRoot"],
        });
        shellProjects.push(created);
        return { kind: "value", value: { ...created, deletedAt: null } };
      }
      if (mutation["type"] === "project.update") {
        return {
          kind: "value",
          value: projectRecord({ title: mutation["title"] ?? "Sample project" }),
        };
      }
      return { kind: "value", value: projectRecord({ deletedAt: at }) };
    });
  });
  afterEach(async () => {
    await connection.close();
    await server.close();
  });

  it("normalises workspace roots", () => {
    expect(normalizeWorkspaceRoot("/srv/sample/")).toBe("/srv/sample");
    expect(normalizeWorkspaceRoot("/srv/sample//")).toBe("/srv/sample");
    expect(normalizeWorkspaceRoot("/srv/./sample/../sample")).toBe("/srv/sample");
  });

  it("reads the shell with the protocol header for list, get, and findByWorkspaceRoot", async () => {
    expect((await projects.list()).map((p) => p.id)).toEqual(["project-1"]);
    expect(await projects.get(projectId("project-1"))).toMatchObject({ id: "project-1" });
    expect(await projects.get(projectId("missing"))).toBeUndefined();
    expect(await projects.findByWorkspaceRoot("/srv/sample///")).toMatchObject({ id: "project-1" });
    for (const request of server.routes.requests) {
      expect(request).toMatchObject({
        method: "GET",
        path: "/api/orchestration/shell",
        headers: { "x-t3-orchestration-protocol": "2", authorization: "Bearer token-1" },
      });
    }
    expect(server.routes.requests).toHaveLength(4);
  });

  it("reads the full project records over GET /api/projects", async () => {
    server.routes.route("GET /api/projects", () => ({
      status: 200,
      body: { projects: [projectRecord()], updatedAt: at, futureField: "kept" },
    }));
    const snapshot = await projects.snapshot();
    expect(snapshot).toMatchObject({
      projects: [{ id: "project-1", deletedAt: null }],
      updatedAt: at,
      futureField: "kept",
    });
  });

  it("create sends project.create over projects.mutate and returns the project", async () => {
    const created = await projects.create({
      title: "Other",
      workspaceRoot: "/srv/other",
      createWorkspaceRootIfMissing: true,
      defaultModelSelection: null,
    });
    expect(mutations).toHaveLength(1);
    expect(mutations[0]).toMatchObject({
      type: "project.create",
      title: "Other",
      workspaceRoot: "/srv/other",
      createWorkspaceRootIfMissing: true,
      defaultModelSelection: null,
      projectId: created.id,
    });
    expect(mutations[0]).not.toHaveProperty("scripts");
    expect(typeof mutations[0]?.["commandId"]).toBe("string");
    expect(created).toMatchObject({ title: "Other", workspaceRoot: "/srv/other", deletedAt: null });

    await projects.create({
      projectId: projectId("project-9"),
      title: "Named",
      workspaceRoot: "/srv/n",
    });
    expect(mutations[1]).toMatchObject({ projectId: "project-9" });
  });

  it("ensure returns the existing project without mutating", async () => {
    const project = await projects.ensure({
      workspaceRoot: "/srv/sample",
      title: "Sample project",
    });
    expect(project.id).toBe("project-1");
    expect(mutations).toEqual([]);
  });

  it("ensure creates a missing project once and finds it on the second call", async () => {
    const first = await projects.ensure({ workspaceRoot: "/srv/other", title: "Other" });
    const second = await projects.ensure({ workspaceRoot: "/srv/other/", title: "Other" });
    expect(mutations).toHaveLength(1);
    expect(mutations[0]).toMatchObject({ type: "project.create", projectId: first.id });
    expect(second.id).toBe(first.id);
  });

  it("ensure renames an existing project through project.update when the title differs", async () => {
    const renamed = await projects.ensure({ workspaceRoot: "/srv/sample", title: "Renamed" });
    expect(mutations).toEqual([
      expect.objectContaining({ type: "project.update", projectId: "project-1", title: "Renamed" }),
    ]);
    expect(renamed.title).toBe("Renamed");
  });

  it("update sends the patch and delete sends force", async () => {
    await projects.update(projectId("project-1"), { autoPull: true, faviconPath: null });
    await projects.delete(projectId("project-1"), { force: true });
    await projects.delete(projectId("project-1"));
    expect(mutations).toMatchObject([
      { type: "project.update", projectId: "project-1", autoPull: true, faviconPath: null },
      { type: "project.delete", projectId: "project-1", force: true },
      { type: "project.delete", projectId: "project-1" },
    ]);
    expect(mutations[2]).not.toHaveProperty("force");
    expect(new Set(mutations.map((m) => m["commandId"])).size).toBe(3);
  });

  it("delete resolves when the project does not exist and rethrows other failures", async () => {
    server.handle("projects.mutate", () => ({
      kind: "fail",
      error: {
        _tag: "ProjectMutationError",
        commandId: "command-1",
        message: "Project 'missing' does not exist for command 'project.delete'.",
      },
    }));
    await expect(projects.delete(projectId("missing"))).resolves.toBeUndefined();
    server.handle("projects.mutate", () => ({
      kind: "fail",
      error: {
        _tag: "ProjectMutationError",
        commandId: "command-1",
        message: "Project 'project-1' is not empty and cannot be deleted without force=true.",
      },
    }));
    await expect(projects.delete(projectId("project-1"))).rejects.toMatchObject({
      code: "rpc_failed",
      tag: "ProjectMutationError",
    });
  });

  it("ensureScratch returns the server's Scratch project", async () => {
    const payloads: unknown[] = [];
    server.handle("projects.ensureScratch", (payload) => {
      payloads.push(payload);
      return { kind: "value", value: { projectId: "project-scratch" } };
    });
    await expect(projects.ensureScratch()).resolves.toEqual({ projectId: "project-scratch" });
    expect(payloads).toEqual([{}]);
    server.handle("projects.ensureScratch", () => ({
      kind: "fail",
      error: {
        _tag: "OrchestrationDispatchCommandError",
        message: "Threads without a project are not available on this environment.",
      },
    }));
    await expect(projects.ensureScratch()).rejects.toMatchObject({
      code: "rpc_failed",
      tag: "OrchestrationDispatchCommandError",
    });
  });

  it("createNew sends the name and keeps the commit error", async () => {
    const payloads: unknown[] = [];
    server.handle("projects.createNew", (payload) => {
      payloads.push(payload);
      return {
        kind: "value",
        value: {
          projectId: "project-new",
          workspaceRoot: "/srv/projects/sample",
          commitError: "Git could not make the first commit.",
        },
      };
    });
    await expect(projects.createNew({ name: "Sample" })).resolves.toEqual({
      projectId: "project-new",
      workspaceRoot: "/srv/projects/sample",
      commitError: "Git could not make the first commit.",
    });
    expect(payloads).toEqual([{ name: "Sample" }]);
    await expect(projects.createNew({ name: " " })).rejects.toMatchObject({ code: "precondition" });
    expect(payloads).toHaveLength(1);
  });

  it("rejects an invalid mutation before sending", async () => {
    await expect(projects.create({ title: "", workspaceRoot: "/srv/new" })).rejects.toMatchObject({
      code: "precondition",
    });
    expect(mutations).toEqual([]);
  });
});
