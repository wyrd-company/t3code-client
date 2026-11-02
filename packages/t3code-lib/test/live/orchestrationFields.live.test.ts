// ---
// relationships:
//   verifies: library-wire
// ---
/** The field-level orchestration additions of 0.1.6, against a real server. */
import * as NodeCrypto from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vite-plus/test";
import { threadId, type ProjectId, type ThreadId } from "../../src/schemas/common.ts";
import {
  connect,
  hasAgent,
  hasLiveServer,
  modelSelection,
  refusal,
  waitFor,
} from "./liveClient.ts";

const isTerminal = (status: string) => ["completed", "failed", "interrupted"].includes(status);

describe.skipIf(!hasLiveServer)("live orchestration fields", () => {
  const client = connect();
  let projectId: ProjectId;
  const created: ThreadId[] = [];
  const newThread = async (title: string, runtimeMode?: "approval-required") => {
    const thread = await client.threads.create({
      projectId,
      title,
      modelSelection,
      ...(runtimeMode === undefined ? {} : { runtimeMode }),
    });
    created.push(thread.id);
    return thread.id;
  };
  const shellRow = async (id: ThreadId) =>
    (await client.shell.snapshot()).threads.find((thread) => thread.id === id);
  const stamped = (id: ThreadId) => ({
    commandId: client.threads.dispatcher.newCommandId(),
    threadId: id,
  });

  beforeAll(async () => {
    ({ projectId } = await client.projects.createNew({ name: "Sample fields" }));
  });
  afterAll(async () => {
    for (const id of created) await client.threads.delete(id).catch(() => undefined);
    await client.projects.delete(projectId, { force: true }).catch(() => undefined);
    await client.close();
  });

  it("records an open with its search query", async () => {
    const id = await newThread("Sample visit");
    await client.threads.dispatch({
      type: "thread.visit",
      ...stamped(id),
      visitedAt: new Date().toISOString(),
      opened: true,
      searchQuery: "sample",
    });
    const row = await waitFor(async () => {
      const found = await shellRow(id);
      return found?.opens ? found : undefined;
    }, "the open");
    expect(row.opens).toMatchObject({ picks: [{ query: "sample" }] });
    expect((await client.threads.projection(id)).thread.opens?.score).toBeGreaterThan(0);
  });

  it("deletes an unused thread when asked to delete only if unused", async () => {
    const id = await newThread("Sample unused");
    await client.threads.dispatch({ type: "thread.delete", ...stamped(id), onlyIfUnused: true });
    await waitFor(async () => ((await shellRow(id)) ? undefined : true), "the delete");
  });

  it("accepts stopDelegatedTasks on an idle thread", async () => {
    const id = await newThread("Sample stop");
    const receipt = await client.threads.dispatch({
      type: "thread.stop",
      ...stamped(id),
      stopDelegatedTasks: false,
    });
    expect(receipt.sequence).toEqual(expect.any(Number));
  });

  it.skipIf(!hasAgent)(
    "reads the launch sequence, keeps a used thread and forks a side chat",
    async () => {
      const launched = await client.threads.launch({
        threadId: threadId(NodeCrypto.randomUUID()),
        projectId,
        title: "Sample launch",
        modelSelection,
        workspace: { type: "root" },
        initialMessage: { text: "Reply with the single word done. Do not use tools." },
      });
      const id = launched.threadId;
      created.push(id);
      expect(launched.sequence).toEqual(expect.any(Number));
      const ended = await waitFor(async () => {
        const row = await shellRow(id);
        return row && isTerminal(row.status) ? row : undefined;
      }, "the run to end");
      expect(ended.status).toBe("completed");

      await client.threads.dispatch({ type: "thread.delete", ...stamped(id), onlyIfUnused: true });
      expect((await client.threads.projection(id)).thread.deletedAt).toBeNull();

      const target = threadId(NodeCrypto.randomUUID());
      created.push(target);
      await client.threads.dispatch({
        type: "thread.fork",
        commandId: client.threads.dispatcher.newCommandId(),
        createdBy: "user",
        creationSource: "web",
        sourceThreadId: id,
        targetThreadId: target,
        sourcePoint: { type: "latest_stable" },
        sideChat: true,
      });
      const fork = await waitFor(
        () => client.threads.projection(target).catch(() => undefined),
        "the side chat",
      );
      expect(fork.thread.lineage).toMatchObject({ parentThreadId: id, sideChat: true });
    },
    300_000,
  );

  it.skipIf(!hasAgent)(
    "refuses feedback on an approval whose capability has no supportsFeedback",
    async () => {
      const id = await newThread("Sample approval", "approval-required");
      await client.threads.startTurn({
        threadId: id,
        text: "Run the shell command `touch sample-file` now. Do not do anything else.",
      });
      const request = await waitFor(async () => {
        const projection = await client.threads.projection(id);
        return projection.runtimeRequests.find((entry) => entry.status === "pending");
      }, "the approval request");
      expect(request.responseCapability).toMatchObject({ type: "live" });
      expect(request.responseCapability).not.toHaveProperty("supportsFeedback");
      const record = await refusal(
        client.threads.respondToApproval({
          threadId: id,
          requestId: request.id,
          decision: "decline",
          feedback: "Sample reason",
        }),
      );
      expect(record).toMatchObject({ _tag: "OrchestrationV2DispatchCommandError" });
      await client.threads.respondToApproval({
        threadId: id,
        requestId: request.id,
        decision: "decline",
      });
      await client.threads.stopThread(id);
    },
    300_000,
  );
});
