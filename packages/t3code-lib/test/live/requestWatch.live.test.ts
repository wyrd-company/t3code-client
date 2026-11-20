// ---
// relationships:
//   verifies: request-watch
// ---
/**
 * The request watch on an owned stock server with its own `HOME`. A local stub ACP agent
 * (`stubAcpAgent.mjs`) asks for permission to run a sample command on each prompt, so a thread
 * raises an approval without a real agent or provider credit. The test measures the time from
 * the request's creation to its report, against the five seconds `request-watch` promises.
 */
import * as NodeFS from "node:fs";
import * as NodePath from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vite-plus/test";
import type { RequestWatchItem, T3Client } from "../../src/index.ts";
import { ProviderDriverKind, ProviderInstanceId, ProjectId } from "../../src/schemas/common.ts";
import { hasLiveServer, waitFor } from "./liveClient.ts";
import { startScratchServer, type PeerServer } from "./peerServer.ts";

const stubAgent = new URL("./stubAcpAgent.mjs", import.meta.url).pathname;
const agent = ProviderInstanceId.parse("sample-agent");

describe.skipIf(!hasLiveServer)("client.requests.watch on a live server", () => {
  let peer: PeerServer;
  let client: T3Client;
  let projectId: ProjectId;
  let requestLog = "";

  beforeAll(async () => {
    peer = await startScratchServer("t3code-lib-request-watch-", (home) => {
      requestLog = NodePath.join(home, "agent-requests.log");
      NodeFS.writeFileSync(requestLog, "");
      return {};
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
        },
      },
    });
    const project = await client.projects.create({
      title: "sample",
      workspaceRoot: (await client.server.getConfig()).cwd,
    });
    projectId = ProjectId.parse(project.id);
    await waitFor(
      async () => {
        const { providers } = await client.server.getConfig();
        const found = providers.find((provider) => provider.instanceId === agent);
        return found?.status === "ready" ? found : undefined;
      },
      "the agent's probe",
      { timeoutMs: 60_000 },
    );
  }, 180_000);
  afterAll(() => peer?.stop());

  it("reports an approval a thread raises, within five seconds of its creation", async () => {
    const controller = new AbortController();
    const items: RequestWatchItem[] = [];
    const reportedAt: number[] = [];
    const watch = (async () => {
      for await (const item of client.requests.watch({ signal: controller.signal })) {
        items.push(item);
        reportedAt.push(Date.now());
      }
    })();
    try {
      await waitFor(async () => items.find((item) => item.kind === "synchronized"), "readiness", {
        timeoutMs: 30_000,
        intervalMs: 50,
      });
      const thread = await client.threads.create({
        projectId,
        title: "Sample thread",
        modelSelection: { instanceId: agent, model: "sample-model" },
        runtimeMode: "approval-required",
        interactionMode: "default",
      });
      await client.threads.startTurn({ threadId: thread.id, text: "Run the sample command." });
      const index = await waitFor(
        async () => {
          const found = items.findIndex((item) => item.kind === "request");
          return found === -1 ? undefined : found;
        },
        "the approval's report",
        { timeoutMs: 60_000, intervalMs: 50 },
      );
      const item = items[index];
      if (item?.kind !== "request") throw new Error("Expected a request.");
      expect(item.request).toMatchObject({
        kind: "approval",
        thread: { id: thread.id, title: "Sample thread" },
        project: { id: projectId, title: "sample" },
        request: { status: "pending" },
      });
      const latency = reportedAt[index]! - Date.parse(item.request.request.createdAt);
      console.info(`request watch latency: ${latency} ms`);
      expect(latency).toBeLessThan(5_000);
      const pending = await client.threads.pendingRequests(thread.id);
      expect(pending.map((request) => request.requestId)).toContain(item.request.requestId);
      await client.threads.stop(thread.id);
    } finally {
      controller.abort();
      await watch;
    }
    expect(items.filter((item) => item.kind === "request")).toHaveLength(1);
  });
});
