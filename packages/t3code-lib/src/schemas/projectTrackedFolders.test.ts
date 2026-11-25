// ---
// relationships:
//   verifies: library
// ---
import { afterEach, beforeEach, describe, expect, it } from "vite-plus/test";
import { FakeT3Server } from "../../test/support/fakeServer.ts";
import { makeShellProject } from "../../test/support/threadFixtures.ts";
import { ProjectsApi } from "../api/projects.ts";
import { CommandDispatcher } from "../api/dispatch.ts";
import { RpcClient } from "../rpc/client.ts";
import { rpcMethods } from "../rpc/registry.ts";
import { projectId } from "./common.ts";
import { OrchestrationProjectShell } from "./orchestration/shell.ts";
import { Project, ProjectMutation } from "./projects.ts";
import { HttpTransport } from "../transport/http.ts";
import { RpcConnection } from "../transport/rpcConnection.ts";
import { SocketTransport } from "../transport/socket.ts";

const folder = { path: "/srv/sample/lib", name: "lib" };
const discovered = { path: "/srv/sample/app", name: "app", discovered: true };

describe("tracked project folders (0.1.12)", () => {
  it("reads tracked folders on a project and its shell, absent on older servers", () => {
    const shell = makeShellProject({ trackedFolders: [discovered, folder] });
    expect(OrchestrationProjectShell.parse(shell).trackedFolders).toEqual([discovered, folder]);
    expect(makeShellProject()).not.toHaveProperty("trackedFolders");
    const record = { ...makeShellProject({ trackedFolders: [folder] }), deletedAt: null };
    expect(Project.parse(record).trackedFolders).toEqual([folder]);
    const tooMany = Array.from({ length: 129 }, (_, index) => ({ path: `/r${index}`, name: "r" }));
    expect(Project.safeParse({ ...record, trackedFolders: tooMany }).success).toBe(false);
    expect(
      Project.safeParse({ ...record, trackedFolders: [{ path: "/r", name: "n".repeat(129) }] })
        .success,
    ).toBe(false);
  });

  it("sends added folders on create and update, and edits to the server's list", () => {
    const base = { commandId: "command-1", projectId: "project-1" };
    const create = ProjectMutation.parse({
      ...base,
      type: "project.create",
      title: "Sample",
      workspaceRoot: "/srv/sample",
      trackedFolders: [folder],
    });
    expect(create).toMatchObject({ trackedFolders: [folder] });
    const update = ProjectMutation.parse({
      ...base,
      type: "project.update",
      trackFolders: [folder],
      untrackFolders: ["/srv/sample/old"],
    });
    expect(update).toMatchObject({ trackFolders: [folder], untrackFolders: ["/srv/sample/old"] });
    expect(
      ProjectMutation.safeParse({ ...base, type: "project.update", untrackFolders: [""] }).success,
    ).toBe(false);
  });

  describe("through the projects facade", () => {
    let server: FakeT3Server;
    let connection: RpcConnection;
    let projects: ProjectsApi;
    let mutations: Record<string, unknown>[];

    beforeEach(async () => {
      server = await FakeT3Server.start();
      mutations = [];
      connection = new RpcConnection(new SocketTransport({ url: async () => server.wsUrl }));
      const rpc = new RpcClient(connection, rpcMethods);
      const http = new HttpTransport({
        baseUrl: server.httpUrl,
        fetch: server.fetch,
        getAccessToken: async () => "token-1",
      });
      projects = new ProjectsApi(http, rpc, new CommandDispatcher(rpc));
      server.handle("projects.mutate", (payload) => {
        mutations.push(payload as Record<string, unknown>);
        return { kind: "value", value: { ...makeShellProject(), deletedAt: null } };
      });
    });
    afterEach(async () => {
      await connection.close();
      await server.close();
    });

    it("passes tracked folders and list edits through", async () => {
      await projects.create({ title: "Sample", workspaceRoot: "/srv/s", trackedFolders: [folder] });
      await projects.update(projectId("project-1"), {
        trackFolders: [folder],
        untrackFolders: ["/srv/sample/old"],
      });
      await projects.create({ title: "Plain", workspaceRoot: "/srv/p" });
      expect(mutations[0]).toMatchObject({ type: "project.create", trackedFolders: [folder] });
      expect(mutations[1]).toMatchObject({
        type: "project.update",
        trackFolders: [folder],
        untrackFolders: ["/srv/sample/old"],
      });
      expect(mutations[2]).not.toHaveProperty("trackedFolders");
    });
  });
});
