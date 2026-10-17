// ---
// relationships:
//   verifies: output-contract
// ---
import { randomUUID } from "node:crypto";
import { expect, it } from "vite-plus/test";
import { commandId, messageId, threadId } from "@wyrd-company/t3code-lib";
import {
  agent,
  cli,
  client,
  ownedThreads,
  record,
  startCommand,
  useDispatchHarness,
} from "./dispatchHarness.ts";

useDispatchHarness("timeout-queue");
it.skipIf(!agent)(
  "detaches an active run then interrupts it while holding its actual queued successor",
  async () => {
    const started = await cli([
      ...startCommand,
      "Use the shell tool to sleep 30 seconds, then reply SAMPLE only.",
      "--json",
    ]);
    expect(started.exit).toBe(0);
    const { threadId: id, runId } = JSON.parse(started.stdout).data;
    ownedThreads.add(id);
    await client.threads.dispatch({
      type: "message.dispatch",
      commandId: commandId(randomUUID()),
      messageId: messageId(randomUUID()),
      threadId: threadId(id),
      createdBy: "user",
      creationSource: "web",
      text: "Reply NEXT only.",
      attachments: [],
      dispatchMode: { type: "queue_after_active" },
    });
    const detached = await cli(["thread", "wait", id, "--timeout", "1s", "--json"]);
    expect(detached.exit).toBe(5);
    expect(JSON.parse(detached.stdout)).toMatchObject({ threadId: id, runId, exitCode: 5 });
    const before = await client.threads.projection(threadId(id));
    expect(["starting", "running", "waiting"]).toContain(
      before.runs.find((run) => run.id === runId)!.status,
    );
    expect(before.runs.find((run) => run.id !== runId)?.status).toBe("queued");
    const interrupted = await cli([
      "thread",
      "wait",
      id,
      "--timeout",
      "1s",
      "--on-timeout",
      "interrupt",
      "--json",
    ]);
    expect(interrupted.exit).toBe(6);
    expect(JSON.parse(interrupted.stdout)).toMatchObject({
      threadId: id,
      runId,
      state: "interrupted",
      exitCode: 6,
    });
    const after = await client.threads.projection(threadId(id));
    expect(after.runs.find((run) => run.id === runId)?.status).toBe("interrupted");
    expect(after.runs.find((run) => run.id !== runId)).toMatchObject({
      status: "queued",
      queueHeld: true,
    });
    record({
      case: "timeout detach then interrupt holds queue",
      threadId: id,
      runId,
      detached,
      interrupted,
      before: before.runs,
      after: after.runs,
    });
  },
);
