// ---
// relationships:
//   verifies: library-wire
// ---
/**
 * Answers to secret requests on an isolated stock server: the refusals, and with
 * `T3_LIVE_AGENT=1` a real agent's request, saved and declined.
 */
import * as NodeCrypto from "node:crypto";
import { afterAll, describe, expect, it } from "vite-plus/test";
import type { schemas } from "../../src/index.ts";
import { threadId, turnItemId } from "../../src/schemas/common.ts";
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

describe.skipIf(!hasLiveServer)("secret request refusals", () => {
  const client = connect();
  afterAll(() => client.close());

  it("refuses an answer to a secret request that does not exist", async () => {
    const answer = (id: schemas.common.ThreadId) =>
      refusal(
        client.rpc.call("secrets.answerRequest", {
          threadId: id,
          turnItemId: turnItemId(NodeCrypto.randomUUID()),
          answer: { type: "decline" },
        }),
      );
    const noThread = await answer(threadId(NodeCrypto.randomUUID()));
    expect(isRpcErrorOfTag(noThread, "SecretRequestError") && noThread.reason).toBe("load_failed");

    const project = await client.projects.createNew({
      name: "Sample missing secret",
    });
    const id = threadId(NodeCrypto.randomUUID());
    await client.threads.ensure({
      threadId: id,
      projectId: project.projectId,
      title: "Sample thread",
      modelSelection,
      runtimeMode: "full-access",
      interactionMode: "default",
    });
    const noItem = await answer(id);
    expect(isRpcErrorOfTag(noItem, "SecretRequestError") && noItem.reason).toBe("not_found");
  });
});

describe.skipIf(!hasLiveServer || !hasAgent)("an agent's secret request", () => {
  const client = connect();
  afterAll(() => client.close());

  it("answers a request, and refuses a second answer", async () => {
    const project = await client.projects.createNew({
      name: "Sample secrets",
    });
    const id = threadId(NodeCrypto.randomUUID());
    await client.threads.ensure({
      threadId: id,
      projectId: project.projectId,
      title: "Sample secret request",
      modelSelection,
      runtimeMode: "full-access",
      interactionMode: "default",
    });
    const requests = async () =>
      (await client.threads.projection(id)).turnItems.filter(
        (item) => isTurnItemOfType(item, "secret_request") === true,
      );
    const ask = async (count: number) => {
      const { messageId } = await client.threads.startTurn({
        threadId: id,
        text: 'Call the MCP tool request_secret now, with label "Sample key" and reason "Sample reason". Use no other tool, then end your turn.',
        interactionMode: "default",
      });
      return waitFor(async () => {
        const row = (await requests())[count - 1];
        if (row && isTurnItemOfType(row, "secret_request") && row.secretStatus === "pending") {
          return row;
        }
        const { runs } = await client.threads.projection(id);
        const run = runs.find((entry) => entry.userMessageId === messageId);
        if (run && isRunTerminalStatus(run.status)) {
          throw new Error(`The run ended ${run.status} with no secret request.`);
        }
        return undefined;
      }, "the secret request");
    };
    const status = (itemId: string, wanted: string) =>
      waitFor(async () => {
        const row = (await requests()).find((item) => item.id === itemId);
        return row && isTurnItemOfType(row, "secret_request") && row.secretStatus === wanted
          ? row
          : undefined;
      }, `a ${wanted} secret request`);
    const idle = () =>
      waitFor(async () => {
        const row = (await client.shell.snapshot()).threads.find((entry) => entry.id === id);
        return row && ["completed", "idle", "failed", "interrupted"].includes(row.status)
          ? row
          : undefined;
      }, "the turn to end");
    try {
      const first = await ask(1);
      const save = {
        threadId: id,
        turnItemId: first.id,
        answer: { type: "save", secret: "sample-value" },
      } as const;
      await client.rpc.call("secrets.answerRequest", save);
      const saved = await status(first.id, "saved");
      expect(JSON.stringify(saved)).not.toContain("sample-value");
      const again = await refusal(client.rpc.call("secrets.answerRequest", save));
      expect(isRpcErrorOfTag(again, "SecretRequestError") && again.reason).toBe("already_answered");
      await idle();

      const second = await ask(2);
      await client.rpc.call("secrets.answerRequest", {
        threadId: id,
        turnItemId: second.id,
        answer: { type: "decline" },
      });
      await status(second.id, "declined");
      await idle();
    } finally {
      await client.threads.stop(id).catch(() => undefined);
    }
  });
});
