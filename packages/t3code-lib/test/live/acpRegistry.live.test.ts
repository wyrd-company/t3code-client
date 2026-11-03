// ---
// relationships:
//   verifies: library-wire
// ---
/**
 * The ACP registry and provider install methods on an owned stock server with its
 * own `HOME`. A local stub agent answers the session, provider and sign-out methods.
 * The tests read the public registry index, and accept a refusal with no route to
 * it. No test prepares an agent, since that can use the host's package manager.
 */
import * as NodeFS from "node:fs";
import * as NodeFSP from "node:fs/promises";
import * as NodeOS from "node:os";
import * as NodePath from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vite-plus/test";
import type { T3Client } from "../../src/index.ts";
import { ProjectId, ProviderDriverKind, ProviderInstanceId } from "../../src/schemas/common.ts";
import type { ServerProvider } from "../../src/schemas/provider.ts";
import { connectWithScopes, firstItem, hasLiveServer, refusal, waitFor } from "./liveClient.ts";
import { startPeerServer, type PeerServer } from "./peerServer.ts";

const stubAgent = new URL("./stubAcpAgent.mjs", import.meta.url).pathname;
const agent = ProviderInstanceId.parse("sample-agent");
const managed = ProviderInstanceId.parse("sample-managed");
const absent = ProviderInstanceId.parse("absent");
const codex = ProviderInstanceId.parse("codex");
const sessionId = "sample-session";

/** An install reuses a `codex` that it finds on `PATH`, so the server must not find one. */
const pathWithoutCodex = () =>
  (process.env["PATH"] ?? "")
    .split(NodePath.delimiter)
    .filter((dir) => !NodeFS.existsSync(NodePath.join(dir, "codex")))
    .join(NodePath.delimiter);

describe.skipIf(!hasLiveServer)("ACP registry methods", () => {
  let peer: PeerServer;
  let client: T3Client;
  let home: string;
  let requestLog: string;
  let projectId: ProjectId;

  const agentRequests = (method: string): Array<Record<string, unknown>> =>
    NodeFS.readFileSync(requestLog, "utf8")
      .split("\n")
      .filter(Boolean)
      .map((line) => JSON.parse(line) as { method: string; params: Record<string, unknown> })
      .filter((request) => request.method === method)
      .map((request) => request.params);

  /** Wait for a snapshot of the agent's instance: its probe runs in the background. */
  const agentProvider = (accept: (provider: ServerProvider) => boolean) =>
    waitFor(
      async () => {
        const { providers } = await client.server.getConfig();
        const found = providers.find((provider) => provider.instanceId === agent);
        return found && accept(found) ? found : undefined;
      },
      "the agent's probe",
      { timeoutMs: 60_000 },
    );

  beforeAll(async () => {
    home = await NodeFSP.mkdtemp(NodePath.join(NodeOS.tmpdir(), "t3code-lib-acp-registry-"));
    requestLog = NodePath.join(home, "agent-requests.log");
    NodeFS.writeFileSync(requestLog, "");
    peer = await startPeerServer({
      environment: {
        HOME: home,
        CODEX_HOME: NodePath.join(home, ".codex"),
        PATH: pathWithoutCodex(),
      },
    });
    client = peer.client;
    await client.rpc.call("server.updateSettings", {
      patch: {
        providerInstances: {
          [agent]: {
            driver: ProviderDriverKind.parse("acpRegistry"),
            displayName: "Sample agent",
            config: {
              source: "local",
              commandPath: process.execPath,
              commandArgs: [stubAgent, requestLog],
            },
          },
          [managed]: {
            driver: ProviderDriverKind.parse("codex"),
            displayName: "Sample managed",
            config: { setupMode: "managed" },
          },
        },
      },
    });
    const project = await client.projects.create({
      title: "sample",
      workspaceRoot: (await client.server.getConfig()).cwd,
    });
    projectId = ProjectId.parse(project.id);
    await agentProvider((provider) => provider.nativeSessions?.canList === true);
  }, 180_000);
  afterAll(async () => {
    await peer?.stop();
    if (home) await NodeFSP.rm(home, { recursive: true, force: true });
  });

  it("lists, imports once and deletes an agent's session", async () => {
    const input = { instanceId: agent, projectId };
    const listed = await client.rpc.call("server.listAcpRegistrySessions", input);
    expect(listed).toMatchObject({ nextCursor: null, canResume: true, canDelete: true });
    expect(listed.sessions[0]).toMatchObject({ sessionId, importedThreadId: null });

    const imported = await client.rpc.call("server.importAcpRegistrySession", {
      ...input,
      sessionId,
      title: "Imported sample",
    });
    expect(imported.imported).toBe(true);
    expect(
      await client.rpc.call("server.importAcpRegistrySession", { ...input, sessionId }),
    ).toEqual({ threadId: imported.threadId, imported: false });
    const again = await client.rpc.call("server.listAcpRegistrySessions", input);
    expect(again.sessions[0]?.importedThreadId).toBe(imported.threadId);

    expect(
      await refusal(client.rpc.call("server.deleteAcpRegistrySession", { ...input, sessionId })),
    ).toMatchObject({ reason: "session_delete_failed" });
    await client.threads.delete(imported.threadId);
    expect(
      await client.rpc.call("server.deleteAcpRegistrySession", { ...input, sessionId }),
    ).toEqual({ deleted: true });
    expect(agentRequests("session/delete")[0]).toMatchObject({ sessionId });
    expect((await client.rpc.call("server.listAcpRegistrySessions", input)).sessions).toEqual([]);
  }, 120_000);

  it("sets and disables an agent's model provider, and sends headers only one way", async () => {
    const input = { instanceId: agent, projectId };
    const listProviders = async () => {
      await agentProvider((provider) => provider.configurableProviders === true);
      return client.rpc.call("server.listAcpRegistryProviders", input);
    };
    const listed = await listProviders();
    expect(listed.providers[0]).toMatchObject({ providerId: "main", required: false });

    const baseUrl = "https://example.invalid/v2";
    expect(
      await client.rpc.call("server.setAcpRegistryProvider", {
        ...input,
        providerId: "main",
        apiType: "openai",
        baseUrl,
        headers: { "x-sample": "sample-value" },
      }),
    ).toEqual({ configured: true });
    expect(agentRequests("providers/set").at(-1)).toMatchObject({
      providerId: "main",
      baseUrl,
      headers: { "x-sample": "sample-value" },
    });
    const after = await listProviders();
    expect(after.providers[0]?.current).toEqual({ apiType: "openai", baseUrl });
    expect(JSON.stringify(after)).not.toContain("sample-value");

    expect(
      await client.rpc.call("server.disableAcpRegistryProvider", { ...input, providerId: "main" }),
    ).toEqual({ disabled: true });
    const disabled = await listProviders();
    expect(disabled.providers[0]?.current).toBeNull();
  }, 120_000);

  it("accepts no address that is not pending, and signs the agent out", async () => {
    expect(
      await client.rpc.call("server.acceptAcpRegistryUrlAuth", {
        instanceId: agent,
        elicitationId: "sample-elicitation",
      }),
    ).toEqual({ accepted: false });
    await agentProvider((provider) => provider.auth.canLogout === true);
    const logout = await client.rpc.call("server.logoutAcpRegistry", { instanceId: agent });
    expect(logout).toEqual({ loggedOut: true });
    expect(agentRequests("auth/logout")).toHaveLength(1);
  }, 120_000);

  it("refuses an instance that is absent or that has no ACP management", async () => {
    const input = { projectId, sessionId };
    expect(
      await refusal(
        client.rpc.call("server.deleteAcpRegistrySession", { ...input, instanceId: absent }),
      ),
    ).toMatchObject({ _tag: "AcpRegistryOperationError", reason: "instance_not_found" });
    expect(
      await refusal(client.rpc.call("server.logoutAcpRegistry", { instanceId: codex })),
    ).toMatchObject({ reason: "session_list_unsupported" });
    expect(
      await refusal(
        client.rpc.call("server.listAcpRegistrySessions", {
          instanceId: agent,
          projectId: ProjectId.parse("absent-project"),
        }),
      ),
    ).toMatchObject({ reason: "project_not_found" });
  });

  it("searches the public index and refuses to prepare an unknown agent", async () => {
    const agentId = "sample-unknown-agent";
    const search = client.rpc.call("server.searchAcpRegistry", { query: "", limit: 2 });
    const found = await search.catch(() => undefined);
    if (found === undefined) {
      expect(await refusal(search)).toMatchObject({ reason: "registry_unavailable" });
    } else {
      expect(found.agents.length).toBeLessThanOrEqual(2);
    }
    expect(
      await refusal(client.rpc.call("server.prepareAcpRegistryAgent", { agentId })),
    ).toMatchObject({ reason: expect.stringMatching(/^(agent_not_found|registry_unavailable)$/u) });
    expect(await client.rpc.call("server.uninstallAcpRegistryManagedBinary", { agentId })).toEqual({
      agentId,
      removed: false,
    });
  }, 90_000);

  it("reports, starts and cancels a managed install, and removes nothing", async () => {
    const instanceId = managed;
    const idle = await firstItem(
      client.rpc.stream("provider.install.subscribe", { instanceId }),
      (state) => state,
    );
    expect(idle).toMatchObject({ phase: "idle", operationId: null, canRemove: false });

    const started = await client.rpc.call("provider.install.start", { instanceId });
    const operationId = started.operationId ?? "";
    expect(started.phase).toBe("downloading");
    const cancelled = await client.rpc.call("provider.install.cancel", {
      instanceId,
      operationId,
    });
    expect(cancelled.operationId).toBe(operationId);
    await firstItem(client.rpc.stream("provider.install.subscribe", { instanceId }), (state) =>
      state.phase === "cancelled" ? state : undefined,
    );

    const removed = await client.rpc.call("provider.install.remove", { instanceId });
    expect(removed.canRemove).toBe(false);
    expect(
      await refusal(client.rpc.call("provider.install.start", { instanceId: codex })),
    ).toMatchObject({ _tag: "ProviderSetupError", operation: "install" });
  }, 60_000);

  it("holds a read scope to the read methods", async () => {
    const reader = await connectWithScopes(client, ["orchestration:read"], peer.baseUrl);
    try {
      expect(
        await refusal(
          reader.rpc.call("server.listAcpRegistrySessions", { instanceId: absent, projectId }),
        ),
      ).toMatchObject({ reason: "instance_not_found" });
      await expect(
        reader.rpc.call("provider.install.start", { instanceId: managed }),
      ).rejects.toMatchObject({ requiredScope: "providers:manage" });
    } finally {
      await reader.close();
    }
  });
});
