// ---
// relationships:
//   verifies: library-wire
// ---
/**
 * The agent session methods on an owned stock server with its own `HOME`. A
 * transcript in that home's Codex folder plays another agent's session.
 */
import * as NodeFSP from "node:fs/promises";
import * as NodeOS from "node:os";
import * as NodePath from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vite-plus/test";
import type { T3Client } from "../../src/index.ts";
import { ProjectId } from "../../src/schemas/common.ts";
import { connectWithScopes, hasLiveServer, refusal } from "./liveClient.ts";
import { startPeerServer, type PeerServer } from "./peerServer.ts";

const sessionId = "019a0000-0000-7000-8000-000000000001";

describe.skipIf(!hasLiveServer)("agent session methods", () => {
  let home: string;
  let workspace: string;
  let peer: PeerServer;
  let client: T3Client;

  const candidate = async () => {
    const { candidates } = await client.rpc.call("agentSessions.scan", {});
    return candidates.find((entry) => entry.path === workspace);
  };

  beforeAll(async () => {
    home = await NodeFSP.realpath(
      await NodeFSP.mkdtemp(NodePath.join(NodeOS.tmpdir(), "t3code-lib-agent-sessions-")),
    );
    workspace = NodePath.join(home, "sample-workspace");
    await NodeFSP.mkdir(workspace);
    const now = new Date();
    const day = NodePath.join(
      home,
      ".codex",
      "sessions",
      String(now.getUTCFullYear()),
      String(now.getUTCMonth() + 1).padStart(2, "0"),
      String(now.getUTCDate()).padStart(2, "0"),
    );
    await NodeFSP.mkdir(day, { recursive: true });
    const timestamp = now.toISOString();
    await NodeFSP.writeFile(
      NodePath.join(day, `rollout-sample-${sessionId}.jsonl`),
      [
        { timestamp, type: "session_meta", payload: { id: sessionId, cwd: workspace } },
        { timestamp, type: "event_msg", payload: { type: "user_message", message: "Sample" } },
        { timestamp, type: "event_msg", payload: { type: "agent_message", message: "Reply" } },
      ]
        .map((record) => JSON.stringify(record))
        .join("\n") + "\n",
    );
    peer = await startPeerServer({
      environment: { HOME: home, CODEX_HOME: NodePath.join(home, ".codex") },
    });
    client = peer.client;
  });

  afterAll(async () => {
    await peer?.stop();
    if (home) await NodeFSP.rm(home, { recursive: true, force: true });
  });

  it("scans a session, and imports it into the project at its folder", async () => {
    await expect(candidate()).resolves.toMatchObject({
      title: "sample-workspace",
      sources: ["codex"],
      threadCount: 1,
      alreadyImported: false,
      git: null,
    });

    const project = await client.projects.create({ title: "Sample", workspaceRoot: workspace });
    const projectId = ProjectId.parse(project.id);
    await expect(candidate()).resolves.toMatchObject({ projectId, alreadyImported: true });

    await expect(
      client.rpc.call("agentSessions.import", { projectId, expectedWorkspaceRoot: workspace }),
    ).resolves.toEqual({ importedCount: 1, skippedCount: 0 });
    const { threads } = await client.shell.snapshot();
    expect(threads.map((thread) => thread.id)).toContain(`import:codex:${sessionId}`);
  });

  it("refuses an absent project, and one that has moved", async () => {
    const absent = ProjectId.parse("sample-absent");
    expect(await refusal(client.rpc.call("agentSessions.import", { projectId: absent }))).toEqual(
      expect.objectContaining({
        _tag: "AgentSessionImportProjectNotFoundError",
        projectId: absent,
      }),
    );
    const moved = await client.projects.create({
      title: "Moved",
      workspaceRoot: NodePath.join(home, "sample-moved"),
      createWorkspaceRootIfMissing: true,
    });
    const projectId = ProjectId.parse(moved.id);
    expect(
      await refusal(
        client.rpc.call("agentSessions.import", { projectId, expectedWorkspaceRoot: workspace }),
      ),
    ).toMatchObject({ _tag: "AgentSessionImportProjectChangedError", projectId });
  });

  it("holds each method to its scope", async () => {
    const reader = await connectWithScopes(client, ["orchestration:read"], peer.baseUrl);
    try {
      await expect(reader.rpc.call("agentSessions.scan", {})).resolves.toMatchObject({
        candidates: expect.any(Array),
      });
      await expect(
        reader.rpc.call("agentSessions.import", { projectId: ProjectId.parse("sample-absent") }),
      ).rejects.toMatchObject({ requiredScope: "orchestration:operate" });
    } finally {
      await reader.close();
    }
  });
});
