// ---
// relationships:
//   verifies: library-facades
// ---
/**
 * Real peer links between two isolated stock servers: the refusals, a link and
 * its removal, and with `T3_LIVE_AGENT=1` an agent's link request, the link
 * origin of a thread that it starts in the peer, and a task that it delegates there.
 */
import * as NodeCrypto from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vite-plus/test";
import type { T3Client, T3RpcError } from "../../src/index.ts";
import { EnvironmentId, threadId, turnItemId, type ThreadId } from "../../src/schemas/common.ts";
import { isRunTerminalStatus } from "../../src/schemas/orchestration/runs.ts";
import { isTurnItemOfType } from "../../src/schemas/orchestration/turnItems.ts";
import { isRpcErrorOfTag } from "../../src/schemas/rpcErrors.ts";
import {
  connect,
  hasAgent,
  hasLiveServer,
  modelSelection,
  refusal,
  waitFor,
} from "./liveClient.ts";
import { startPeerServer, type PeerServer } from "./peerServer.ts";

const setLinksEnabled = (client: T3Client, enabled: boolean) =>
  client.rpc.callRaw("server.updateSettings", { patch: { linkedEnvironmentsEnabled: enabled } });

/** A pairing code from the peer. Nothing logs it. */
const pairingCode = async (peer: PeerServer) => {
  const { credential } = await peer.client.auth.createPairingCredential({
    label: "Sample link",
    scopes: ["orchestration:read", "orchestration:operate"],
  });
  return credential;
};

const peerLinkReason = (record: T3RpcError["record"]) =>
  isRpcErrorOfTag(record, "PeerLinkError") ? record.reason : undefined;

// It changes a server setting and expects no links, so that it runs only on the server it owns.
const ownsServer = hasLiveServer && Boolean(process.env["T3_LIVE_HOME"]);

describe.skipIf(!ownsServer)("live peer links", () => {
  let client: T3Client;
  let peer: PeerServer;
  let peerEnvironmentId: EnvironmentId;

  beforeAll(async () => {
    client = connect();
    peer = await startPeerServer();
    peerEnvironmentId = (await peer.client.server.environment()).environmentId;
    // Each side needs the setting: the peer refuses to register an environment without it.
    await setLinksEnabled(peer.client, true);
  }, 90_000);

  afterAll(async () => {
    try {
      await setLinksEnabled(client, false);
      await client.peerLinks.unlink(peerEnvironmentId);
      await client.close();
    } finally {
      await peer.stop();
    }
  });

  it("advertises the capabilities", async () => {
    const { capabilities } = await client.server.environment();
    expect(capabilities).toMatchObject({
      peerLinks: true,
      mcpModeLimitHeader: true,
      linkFence: true,
    });
  });

  it("starts with no links, and refuses a link while the setting is off", async () => {
    await expect(client.peerLinks.list()).resolves.toEqual([]);
    const record = await refusal(
      client.peerLinks.link({
        url: peer.baseUrl,
        pairingCode: await pairingCode(peer),
        access: "read-only",
      }),
    );
    expect(peerLinkReason(record)).toBe("disabled");
  });

  it("refuses bad links and reports a missing link and request", async () => {
    await setLinksEnabled(client, true);
    const baseUrl = process.env["T3_LIVE_URL"] ?? "";
    const link = (url: string, code: string) =>
      refusal(client.peerLinks.link({ url, pairingCode: code, access: "read-only" }));
    expect(peerLinkReason(await link(baseUrl, "sample-code"))).toBe("self");
    expect(peerLinkReason(await link(peer.baseUrl, "sample-code"))).toBe("pairing_rejected");
    expect(peerLinkReason(await link("http://peer.example.test", "sample-code"))).toBe(
      "unreachable",
    );
    const narrow = await refusal(
      client.peerLinks.link({
        url: peer.baseUrl,
        pairingCode: await pairingCode(peer),
        access: "full-access",
      }),
    );
    expect(peerLinkReason(narrow)).toBe("pairing_rejected");
    await expect(client.peerLinks.unlink(EnvironmentId.parse("environment-none"))).resolves.toBe(
      false,
    );
    const answerReason = async (id: ThreadId) => {
      const record = await refusal(
        client.peerLinks.answerRequest({
          threadId: id,
          turnItemId: turnItemId("item-none"),
          answer: { type: "decline" },
        }),
      );
      return isRpcErrorOfTag(record, "PeerLinkRequestError") ? record.reason : undefined;
    };
    await expect(answerReason(threadId("thread-none"))).resolves.toBe("load_failed");
    const project = await client.projects.createNew({ name: "Sample missing request" });
    const id = threadId(NodeCrypto.randomUUID());
    await client.threads.ensure({
      threadId: id,
      projectId: project.projectId,
      title: "Sample thread",
      modelSelection,
      runtimeMode: "auto",
      interactionMode: "default",
    });
    await expect(answerReason(id)).resolves.toBe("not_found");
  });

  it("links a peer, lists it as reachable and removes it", async () => {
    await setLinksEnabled(client, true);
    const linked = await client.peerLinks.link({
      url: peer.baseUrl,
      pairingCode: await pairingCode(peer),
      access: "read-only",
      expectedEnvironmentId: peerEnvironmentId,
      expectedLabel: "Sample peer",
    });
    expect(linked).toMatchObject({
      environmentId: peerEnvironmentId,
      urls: [peer.baseUrl],
      access: "read-only",
      lastError: null,
    });
    const listed = await client.peerLinks.list();
    expect(listed).toHaveLength(1);
    expect(listed[0]).toMatchObject({ environmentId: peerEnvironmentId, status: "reachable" });
    await expect(client.peerLinks.unlink(peerEnvironmentId)).resolves.toBe(true);
    await expect(client.peerLinks.list()).resolves.toEqual([]);
  }, 60_000);

  it.skipIf(!hasAgent)(
    "answers an agent's link request, then sees the link origin in the peer",
    async () => {
      await setLinksEnabled(client, true);
      const project = await client.projects.createNew({ name: "Sample links" });
      let id = threadId(NodeCrypto.randomUUID());
      const openThread = async () => {
        id = threadId(NodeCrypto.randomUUID());
        await client.threads.ensure({
          threadId: id,
          projectId: project.projectId,
          title: "Sample link request",
          modelSelection,
          runtimeMode: "full-access",
          interactionMode: "default",
        });
      };
      const linkRequests = async () =>
        (await client.threads.projection(id)).turnItems.filter(
          (item) => isTurnItemOfType(item, "link_request") === true,
        );
      // An agent can complete a turn saying that the tool is not available, with no tool row, and
      // later turns of that thread say the same. Only that outcome asks again, in `prepare`'s
      // thread. A run that failed, or a tool call that went wrong, fails the test.
      const askUntil = async <T>(
        text: string,
        read: () => Promise<T | undefined>,
        prepare?: () => Promise<void>,
      ): Promise<T> => {
        for (let attempt = 0; attempt < 3; attempt += 1) {
          await prepare?.();
          const { messageId } = await client.threads.startTurn({
            threadId: id,
            text,
            interactionMode: "default",
          });
          const seen = await waitFor(async () => {
            const { runs, turnItems } = await client.threads.projection(id);
            const run = runs.find((entry) => entry.userMessageId === messageId);
            const found = await read();
            if (found !== undefined) return { found };
            if (run === undefined || !isRunTerminalStatus(run.status)) return undefined;
            if (run.status !== "completed") throw new Error(`The run ended ${run.status}.`);
            const called = turnItems.filter(
              (item) =>
                item.runId === run.id &&
                ["dynamic_tool", "command_execution", "link_request", "error"].includes(item.type),
            );
            if (called.length > 0) {
              const types = called.map((item) => item.type).join(", ");
              throw new Error(`The turn made other calls than the requested one: ${types}.`);
            }
            return { found: undefined };
          }, "the requested tool call");
          if (seen.found !== undefined) return seen.found;
        }
        throw new Error("The agent did not make the requested tool call.");
      };
      const askLink = (reason: string, count: number, prepare?: () => Promise<void>) =>
        askUntil(
          `Call the MCP tool t3_environment_link now, with url "${peer.baseUrl}" and reason "${reason}". Use no other tool, then end your turn.`,
          async () => {
            const row = (await linkRequests())[count - 1];
            return row !== undefined &&
              isTurnItemOfType(row, "link_request") &&
              row.linkStatus === "pending"
              ? row
              : undefined;
          },
          prepare,
        );
      const ended = (itemId: string, status: string) =>
        waitFor(async () => {
          const row = (await linkRequests()).find((item) => item.id === itemId);
          if (row === undefined || !isTurnItemOfType(row, "link_request")) return undefined;
          if (row.linkStatus === "failed" && status !== "failed") {
            throw new Error(`The link request failed: ${row.failure ?? "no failure text"}`);
          }
          return row.linkStatus === status ? row : undefined;
        }, `a ${status} link request`);
      const idle = () =>
        waitFor(async () => {
          const row = (await client.shell.snapshot()).threads.find((entry) => entry.id === id);
          return row && ["completed", "idle", "failed", "interrupted"].includes(row.status)
            ? row
            : undefined;
        }, "the turn to end");

      const first = await askLink("Sample decline", 1, openThread);
      // `reason` is optional in the tool input, and the server records its absence as empty text.
      expect(first).toMatchObject({ reason: expect.any(String), url: peer.baseUrl });
      expect(first.environmentId).toBe(peerEnvironmentId);
      const decline = { threadId: id, turnItemId: first.id, answer: { type: "decline" } } as const;
      await client.peerLinks.answerRequest(decline);
      await ended(first.id, "declined");
      const again = await refusal(client.peerLinks.answerRequest(decline));
      expect(isRpcErrorOfTag(again, "PeerLinkRequestError") && again.reason).toBe(
        "already_answered",
      );
      await idle();

      const second = await askLink("Sample link", 2);
      await client.peerLinks.answerRequest({
        threadId: id,
        turnItemId: second.id,
        answer: {
          type: "link",
          urls: [peer.baseUrl],
          access: "auto",
          pairingCode: await pairingCode(peer),
        },
      });
      const linked = await ended(second.id, "linked");
      expect(linked).toMatchObject({
        linkedEnvironmentId: peerEnvironmentId,
        linkedAccess: "auto",
      });
      await idle();

      const peerProject = await peer.client.projects.createNew({ name: "Sample peer project" });
      const peerModel = JSON.stringify({
        instanceId: modelSelection.instanceId,
        model: modelSelection.model,
      });
      const target = JSON.stringify({
        environmentId: peerEnvironmentId,
        projectId: peerProject.projectId,
        providerInstanceId: modelSelection.instanceId,
        model: modelSelection.model,
      });
      const delegated = await askUntil(
        `Call the MCP tool t3_thread_launch now, with environmentId "${peerEnvironmentId}", projectId "${peerProject.projectId}", modelSelection ${peerModel} and title "Sample launched". Pass no message. Then call the MCP tool delegate_task with task "Reply with the word done", title "Sample delegated", target ${target}. Use no other tool, then end your turn.`,
        async () => {
          const { threads } = await peer.client.shell.snapshot();
          return threads.find((entry) => entry.delegatedFrom !== undefined);
        },
      );
      const launched = await waitFor(async () => {
        const { threads } = await peer.client.shell.snapshot();
        return threads.find((entry) => entry.title.includes("Sample launched"));
      }, "a launched thread in the peer");
      expect(launched.linkOrigin).toMatchObject({ access: "auto" });
      expect(launched.delegatedFrom).toBeUndefined();
      expect(delegated.delegatedFrom).toMatchObject({
        environmentId: (await client.server.environment()).environmentId,
        threadId: id,
      });
      expect(delegated.linkOrigin).toEqual(launched.linkOrigin);
      await client.threads.stop(id);
      await peer.client.threads.stop(delegated.id);
    },
    600_000,
  );
});
