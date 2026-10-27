// ---
// relationships:
//   verifies: command-line
//   references: testing
// ---
import { randomUUID } from "node:crypto";
import { commandId, messageId, providerInstanceId } from "@wyrd-company/t3code-lib";
import { expect, it } from "vite-plus/test";
import { agent, cli, client, ownedThreads, record, useDispatchHarness } from "./dispatchHarness.ts";

useDispatchHarness("queue-recovery");

async function stoppedQueue() {
  const { projectId } = await client.projects.ensureScratch();
  const thread = await client.threads.create({
    projectId,
    title: "Sample queue recovery",
    modelSelection: { instanceId: providerInstanceId("codex"), model: "gpt-6-luna" },
  });
  ownedThreads.add(thread.id);
  for (const [index, text] of [
    "Reply SAMPLE only.",
    "Reply SECOND only.",
    "Reply THIRD only.",
  ].entries()) {
    await client.threads.dispatch({
      type: "message.dispatch",
      commandId: commandId(randomUUID()),
      messageId: messageId(randomUUID()),
      threadId: thread.id,
      createdBy: "user",
      creationSource: "web",
      text,
      attachments: [],
      dispatchMode: { type: index === 0 ? "defer_start" : "queue_after_active" },
    });
  }
  const before = await client.threads.projection(thread.id);
  expect(before.runs.map((run) => run.status)).toEqual(["preparing", "queued", "queued"]);
  expect(before.providerTurns).toEqual([]);
  const stopped = await cli(["thread", "stop", thread.id, "--json"]);
  expect(stopped.exit).toBe(0);
  expect(JSON.parse(stopped.stdout)).toEqual({ data: { threadId: thread.id }, exitCode: 0 });
  await expect
    .poll(async () =>
      (await client.threads.projection(thread.id)).runs.map((run) => ({
        status: run.status,
        queueHeld: run.queueHeld === true,
      })),
    )
    .toEqual([
      { status: "interrupted", queueHeld: false },
      { status: "queued", queueHeld: true },
      { status: "queued", queueHeld: true },
    ]);
  const after = await client.threads.projection(thread.id);
  expect(after.providerTurns).toEqual([]);
  expect(after.runs.map((run) => run.id)).toEqual(before.runs.map((run) => run.id));
  return { thread, runs: after.runs };
}

it("native Stop holds actual queued successors without starting a provider", async () => {
  const { thread, runs } = await stoppedQueue();
  const status = await cli(["thread", "status", thread.id]);
  expect(status.exit).toBe(0);
  expect(status.stdout).toContain(runs[1]!.id);
  expect(status.stdout).toContain(runs[2]!.id);
});

it.skipIf(!agent).each(["resume", "start"] as const)(
  "%s releases a populated queue and preserves selected execution order",
  async (control) => {
    const { thread, runs } = await stoppedQueue();
    const selected = control === "start" ? runs[2]! : runs[1]!;
    const follower = control === "start" ? runs[1]! : runs[2]!;
    const args = ["thread", "queue", control, thread.id];
    if (control === "start") args.push(selected.id);
    const result = await cli([...args, "--json"]);
    expect(result.exit).toBe(0);
    expect(JSON.parse(result.stdout)).toEqual({
      data: { threadId: thread.id, ...(control === "start" ? { runId: selected.id } : {}) },
      exitCode: 0,
    });
    await expect
      .poll(
        async () => {
          const projection = await client.threads.projection(thread.id);
          return projection.runs
            .filter((run) => run.id === selected.id || run.id === follower.id)
            .map((run) => run.status);
        },
        { timeout: 180_000, interval: 250 },
      )
      .toEqual(["completed", "completed"]);
    const after = await client.threads.projection(thread.id);
    const first = after.runs.find((run) => run.id === selected.id)!;
    const second = after.runs.find((run) => run.id === follower.id)!;
    expect(first.queueHeld).toBe(false);
    expect(second.queueHeld).toBe(false);
    expect(first.startedAt).not.toBeNull();
    expect(first.completedAt).not.toBeNull();
    expect(second.startedAt).not.toBeNull();
    expect(Date.parse(first.startedAt!)).toBeLessThan(Date.parse(second.startedAt!));
    expect(Date.parse(first.completedAt!)).toBeLessThanOrEqual(Date.parse(second.startedAt!));
    record({
      case: `populated queue ${control}`,
      threadId: thread.id,
      selectedRunId: first.id,
      followerRunId: second.id,
      firstStartedAt: first.startedAt,
      firstCompletedAt: first.completedAt,
      secondStartedAt: second.startedAt,
    });
  },
);
